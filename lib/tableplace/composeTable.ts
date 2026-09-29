import type { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { MAP_CATALOG } from "@/lib/pro/mapCatalog";
import type { ProMapDef } from "@/lib/pro/protocol";
import {
  absoluteUrl,
  deckToPlayerPack,
  type DeckToPackResult,
  type PlayerPiece,
} from "./deckToPack";
import {
  besideOnBoard,
  boardGeometry,
  type BoardGeometry,
  type CardSlot,
  forSeat,
  FRONT_STRIP,
  mapSize,
  OFF_BOARD_FIGHTER_RADIUS,
  PLACEMENT_CAP,
  SEAT_ROTATION,
  seatArea,
  type Seat,
  SNAP_POINT_CAP,
  type XZ,
} from "./layout";
import { mapToTablePack, type TableMap } from "./mapToPack";
import type {
  CallerPlacement,
  FaceResolver,
  LobbyRequest,
  PackPiece,
  Skipped,
  SnapPoint,
  TbppPack,
} from "./types";

export type ComposeTableInput = {
  seats: [DeckImportType, DeckImportType];
  map: TableMap;
  /** One resolver for both seats, or one per seat. */
  faces: FaceResolver | [FaceResolver, FaceResolver];
  /**
   * The board's spaces. Omitted, it is looked up in the Pro map catalog by
   * image URL; `null` means the board has none.
   */
  mapDef?: ProMapDef | null;
  ttlSeconds?: number;
};

export type ComposeTableResult = {
  /** null when either deck is missing a finished face. */
  body: LobbyRequest | null;
  skipped: Skipped[];
};

const DEFAULT_TTL_SECONDS = 3600;
const FACE_UP_SLOTS = new Set(["hero", "sidekick", "rules", "extras"]);
/** The printed start slots a duel hero can begin on, seat 0's fallback first. */
const START_SLOTS = [1, 2] as const;

/**
 * The start slot on the seat's own half of the board: seat 0 sits at +z and
 * image y maps to z. When the two slots share a half (or one is missing),
 * seat 0 takes slot 1 and seat 1 takes slot 2.
 */
const heroStartFor = (board: BoardGeometry, seat: Seat) => {
  const [a, b] = START_SLOTS.map((slot) =>
    board.spaces.find((s) => s.start === slot),
  );
  const own = (s?: { position: XZ }) =>
    !!s && (seat === 0 ? s.position[1] > 0 : s.position[1] < 0);
  if (a && b && own(a) !== own(b)) return own(a) ? a : b;
  return seat === 0 ? a : b;
};

/** Finds a board's def by image url, relative (`/maps/x.webp`) or absolute. */
export const catalogMapDef = (imageUrl: string): ProMapDef | null => {
  const url = absoluteUrl(imageUrl);
  return (
    MAP_CATALOG.find(
      (e) => e.map.meta.imageUrl && absoluteUrl(e.map.meta.imageUrl) === url,
    )?.map ?? null
  );
};

const tokenIndices = (pieces: PlayerPiece[]) =>
  Array.from(
    new Set(pieces.flatMap((p) => (p.role === "token" ? [p.token] : []))),
  );

const tokenName = (pieces: PlayerPiece[], token: number) =>
  pieces.find((p) => p.role === "token" && p.token === token)?.piece.name ??
  `Token ${token + 1}`;

/**
 * Drops saved tokens from the end, from whichever seat holds more, until the
 * whole request fits table.place's placement cap: a 413 is never sent.
 */
const fitPlacementCap = (
  seats: { pack: TbppPack; pieces: PlayerPiece[] }[],
  skipped: Skipped[],
): boolean => {
  const count = () =>
    seats.reduce(
      (n, s) => n + (s.pack.decks?.length ?? 0) + s.pieces.length,
      0,
    );
  while (count() > PLACEMENT_CAP) {
    const withTokens = seats
      .map((s, seat) => ({ s, seat, tokens: tokenIndices(s.pieces) }))
      .filter((x) => x.tokens.length)
      .sort((a, b) => b.s.pieces.length - a.s.pieces.length);
    if (!withTokens.length) {
      skipped.push(
        `This table needs ${count()} placements and table.place places at most ${PLACEMENT_CAP}: too many cards and figures to drop tokens alone`,
      );
      return false;
    }
    const { s, seat, tokens } = withTokens[0];
    const last = tokens[tokens.length - 1];
    skipped.push(
      `Seat ${seat}: token "${tokenName(s.pieces, last)}" left off (table.place places at most ${PLACEMENT_CAP} things)`,
    );
    s.pieces = s.pieces.filter(
      (p) =>
        !(
          (p.role === "token" || p.role === "token-counter") &&
          p.token === last
        ),
    );
  }
  return true;
};

const placeSeat = (
  seat: Seat,
  pack: TbppPack,
  playerPieces: PlayerPiece[],
  board: BoardGeometry | null,
  mapWidth: number,
  skipped: Skipped[],
) => {
  const area = seatArea(
    seat,
    mapWidth,
    (pack.decks ?? []).map((d) => d.slot),
  );
  const rotation = SEAT_ROTATION[seat];
  const placements: CallerPlacement[] = [];

  for (const deck of pack.decks ?? []) {
    placements.push({
      kind: "deck",
      pack: pack.id,
      slot: deck.slot,
      seat,
      position: area.card(deck.slot as CardSlot),
      rotation,
      ...(FACE_UP_SLOTS.has(deck.slot) ? { faceUp: true } : {}),
    });
  }

  const kit = area.kit();
  const nextSpot = () => kit.next().value;

  const heroStart = board ? heroStartFor(board, seat) : undefined;
  const onBoard: { position: XZ; radius: number }[] = [];
  const onBoardFighter = (p: PlayerPiece) =>
    !!board && !!heroStart && p.role === "fighter" && p.fighter !== "extra";
  const placeFighter = (p: PlayerPiece & { role: "fighter" }) => {
    if (onBoardFighter(p)) {
      const radius = board!.fighterRadius;
      const position =
        p.fighter === "hero"
          ? heroStart!.position
          : besideOnBoard(heroStart!.position, radius, board!, onBoard);
      onBoard.push({ position, radius });
      return { position, radius };
    }
    const position = nextSpot();
    return position ? { position, radius: OFF_BOARD_FIGHTER_RADIUS } : null;
  };

  // The dials in a row beside the hero card, in fighter order; a figure off
  // the board stands right after its dial. Then the tokens.
  const ordered: PlayerPiece[] = [
    ...playerPieces.filter(
      (p) => p.role === "hp" || (p.role === "fighter" && !onBoardFighter(p)),
    ),
    ...playerPieces.filter(onBoardFighter),
    ...playerPieces.filter(
      (p) => p.role === "token" || p.role === "token-counter",
    ),
  ];
  const pieces: PackPiece[] = [];
  const droppedTokens = new Set<number>();
  for (const p of ordered) {
    // a detached badge goes with its token
    if (p.role === "token-counter" && droppedTokens.has(p.token)) continue;
    const spot =
      p.role === "fighter" ? placeFighter(p) : { position: nextSpot() };
    if (!spot?.position) {
      if (p.role === "token") droppedTokens.add(p.token);
      skipped.push(`Seat ${seat}: "${p.piece.name}" left off (no room)`);
      continue;
    }
    const radius = "radius" in spot ? spot.radius : undefined;
    placements.push({
      kind: "piece",
      pack: pack.id,
      piece: pieces.length,
      seat,
      position: spot.position,
      rotation,
      ...(p.value !== undefined ? { value: p.value } : {}),
    });
    pieces.push({
      ...p.piece,
      ...(radius ? { radius } : {}),
      position: spot.position,
    });
  }

  return {
    pack: { ...pack, ...(pieces.length ? { pieces } : {}) },
    placements,
  };
};

const snapPoints = (
  board: BoardGeometry | null,
  skipped: Skipped[],
): SnapPoint[] => {
  const strips: SnapPoint[] = ([0, 1] as const).flatMap((seat) =>
    FRONT_STRIP.map(({ position }) => ({
      position: forSeat(seat, position),
      rotation: SEAT_ROTATION[seat],
    })),
  );
  const spaces: SnapPoint[] = (board?.spaces ?? []).map((s) => ({
    position: s.position,
    radius: board!.spaceRadius,
  }));
  const all = [...strips, ...spaces];
  if (all.length > SNAP_POINT_CAP) {
    skipped.push(
      `${all.length - SNAP_POINT_CAP} of ${all.length} snap points left off (table.place takes at most ${SNAP_POINT_CAP})`,
    );
  }
  return all.slice(0, SNAP_POINT_CAP);
};

/**
 * The whole `POST /v1/lobbies` body for a duel: both decks, the map centred,
 * every card pile and piece placed per `layout.ts`, and snap points on the
 * front strips and on every printed space.
 */
export const composeTable = ({
  seats,
  map,
  faces,
  mapDef,
  ttlSeconds = DEFAULT_TTL_SECONDS,
}: ComposeTableInput): ComposeTableResult => {
  const converted: DeckToPackResult[] = seats.map((deck, seat) =>
    deckToPlayerPack(deck, {
      faces: Array.isArray(faces) ? faces[seat] : faces,
      seat: seat as Seat,
    }),
  );
  const skipped = converted.flatMap((c, seat) =>
    c.skipped.map((s) => `Seat ${seat}: ${s}`),
  );
  if (converted.some((c) => !c.pack)) return { body: null, skipped };

  const ratio = map.width / map.height;
  const def = mapDef === undefined ? catalogMapDef(map.imageUrl) : mapDef;
  const board = def ? boardGeometry(def, ratio) : null;

  const sides = converted.map((c) => ({ pack: c.pack!, pieces: c.pieces }));
  if (!fitPlacementCap(sides, skipped)) return { body: null, skipped };
  const placed = sides.map((s, seat) =>
    placeSeat(
      seat as Seat,
      s.pack,
      s.pieces,
      board,
      mapSize(ratio).width,
      skipped,
    ),
  );

  return {
    body: {
      version: 1,
      layout: "duel-2p",
      packs: [...placed.map((p) => p.pack), mapToTablePack(map)],
      placements: placed.flatMap((p) => p.placements),
      snapPoints: snapPoints(board, skipped),
      ttlSeconds,
    },
    skipped,
  };
};
