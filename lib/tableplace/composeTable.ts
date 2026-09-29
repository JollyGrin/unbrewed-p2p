import type { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { MAP_CATALOG } from "@/lib/pro/mapCatalog";
import type { ProMapDef } from "@/lib/pro/protocol";
import {
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
/** The printed start slot each seat's hero begins on. */
const START_SLOT = [1, 2] as const;

export const catalogMapDef = (imageUrl: string): ProMapDef | null =>
  MAP_CATALOG.find((e) => e.map.meta.imageUrl === imageUrl)?.map ?? null;

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
) => {
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
    if (!withTokens.length) break;
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
};

const placeSeat = (
  seat: Seat,
  pack: TbppPack,
  playerPieces: PlayerPiece[],
  board: BoardGeometry | null,
  mapWidth: number,
  skipped: Skipped[],
) => {
  const area = seatArea(seat, mapWidth);
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

  const column = area.column();
  const nextSpot = () => column.next().value;

  const heroStart = board?.spaces.find((s) => s.start === START_SLOT[seat]);
  const onBoard: { position: XZ; radius: number }[] = [];
  const placeFighter = (p: PlayerPiece & { role: "fighter" }) => {
    if (board && heroStart && p.fighter !== "extra") {
      const radius = board.fighterRadius;
      const position =
        p.fighter === "hero"
          ? heroStart.position
          : besideOnBoard(heroStart.position, radius, board, onBoard);
      onBoard.push({ position, radius });
      return { position, radius };
    }
    const position = nextSpot();
    return position ? { position, radius: OFF_BOARD_FIGHTER_RADIUS } : null;
  };

  // HP counters, then figures (the hero first), then the token loadout
  const ordered = [
    ...playerPieces.filter((p) => p.role === "hp"),
    ...playerPieces.filter((p) => p.role === "fighter" && p.fighter === "hero"),
    ...playerPieces.filter((p) => p.role === "fighter" && p.fighter !== "hero"),
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

const snapPoints = (board: BoardGeometry | null): SnapPoint[] => {
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
  return [...strips, ...spaces].slice(0, SNAP_POINT_CAP);
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
  fitPlacementCap(sides, skipped);
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
      snapPoints: snapPoints(board),
      ttlSeconds,
    },
    skipped,
  };
};
