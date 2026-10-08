/**
 * Table layout v3: every coordinate the converter sends to table.place.
 *
 * World units, per api.table.place/llms.txt §4.5: the felt is x ∈ [-30, 30],
 * z ∈ [-15, 15]; seat 0 sits at +z looking toward -z (so +x is its right),
 * seat 1 at -z. Nothing is mirrored for us, so everything here is authored for
 * seat 0 and `mirror()` turns it into seat 1's `(-x, -z)`.
 *
 * Everything stays inside VIEW: table.place's camera (fov 35, maxDistance 40)
 * sees about 40 × 25 world units at full zoom-out on a 16:10 screen, so
 * anything past it is off-screen until someone pans.
 *
 * Each player's kit sits together at their front-right, off the map, like
 * the physical game: the card piles from the draw deck outward (a missing
 * pile leaves no gap), then the rule cards, each a single card in its own
 * cell; the dials in a row in front of the hero card on, then tokens. The
 * combat spots (a, b) stay in the middle of the front row. Seat 0 is at the
 * bottom; seat 1 is the same turned half a turn.
 *
 *   ┌───────────────────────────────────────────────────────┐
 *   │ 1 1 r r  X  S  H  D  K  b a                           │ seat 1
 *   │ • • • •  •  •  •  ░  ░                                │
 *   │ 2 2 2 ┌───────────────────────────────────┐           │
 *   │ 2 2 2 │                                   │           │
 *   │       │     map, centred, ≤ 26 × 16       │           │
 *   │       │                                   │ 2 2 2     │
 *   │       └───────────────────────────────────┘ 2 2 2     │
 *   │                           ░  ░  •  •  •  •  • • •     │
 *   │                     a b   K  D  H  S  X  r  r 1 1     │ seat 0
 *   └───────────────────────────────────────────────────────┘
 *   K deck  D discard  H hero  S sidekick  X extras  r a rule card
 *   The card row holds CARD_ROW_CELLS cells. Rule cards the row has no cell
 *   for share its last cell as one pile.
 *   Piece cells fill in this order: • the row in front of the hero card on,
 *   1 the card row past the last rule card, 2 the corner beside the map, and
 *   ░ in front of the deck and discard.
 */
export type Seat = 0 | 1;
export type XZ = [number, number];

export const FELT_HALF_X = 30;
export const FELT_HALF_Z = 15;

/** What a zoomed-out camera shows: every placement stays inside it. */
export const VIEW = { halfX: 20, halfZ: 12.5 } as const;

/** table.place's own footprints: cards closer than this merge into one pile. */
export const CARD_STACK_RADIUS = 1.7;
export const TOKEN_RADIUS = 0.75;
/** A fighter figure standing off the board. */
export const OFF_BOARD_FIGHTER_RADIUS = 0.85;

export const PLACEMENT_CAP = 100;
export const SNAP_POINT_CAP = 200;

export const SEAT_ROTATION = [0, 180] as const;

/** The map box: leaves a card row and a piece row per seat, and a corner per side. */
export const MAP_MAX_HEIGHT = 16;
export const MAP_MAX_WIDTH = 26;

/** A board overlay's world size. table.place's `scale` is its HEIGHT (z). */
export const mapSize = (ratio: number) => {
  const height = Math.min(MAP_MAX_HEIGHT, MAP_MAX_WIDTH / ratio);
  return { width: ratio * height, height };
};

/** Seat 1's copy of a seat 0 coordinate. */
export const mirror = ([x, z]: XZ): XZ => [-x || 0, -z || 0];

export const forSeat = (seat: Seat, p: XZ): XZ => (seat === 0 ? p : mirror(p));

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Seat 0's front row: the combat spots in the middle, then the kit's card
 * piles to the player's right. Cards are 1.4 × 2, so a pile's footprint
 * reaches 1 either side: z 12.4, inside VIEW, and 2.4 off a map at
 * MAP_MAX_HEIGHT.
 */
export const FRONT_ROW_Z = 11.4;
/** Piles 1.8 apart: past CARD_STACK_RADIUS, with a 0.4 gap between cards. */
const PILE_STEP = 1.8;
export const CARD_ORDER = [
  "deck",
  "discard",
  "hero",
  "sidekick",
  "extras",
  "rules",
] as const;
export type CardSlot = (typeof CARD_ORDER)[number];
/**
 * The nth cell of a seat's card row, in CARD_ORDER with no gaps: the draw
 * deck nearest the player's centre-right, 0.5 clear of the boost card.
 */
export const pileX = (n: number) => round(3.4 + n * PILE_STEP);
const CARD_HALF_WIDTH = 0.7;
/** Cells of the card row a whole card fits in, inside VIEW. */
export const CARD_ROW_CELLS =
  Math.floor((VIEW.halfX - CARD_HALF_WIDTH - pileX(0)) / PILE_STEP + 1e-9) + 1;

/** The nth rule card's slot: `rules`, `rules-2`, `rules-3`, … */
export const ruleSlot = (n: number) => (n ? `rules-${n + 1}` : "rules");
export const isRuleSlot = (slot: string) => /^rules(-\d+)?$/.test(slot);

/**
 * How `rules` rule cards share what the card row has left after `piles`
 * piles: `loose` of them lie one to a cell. When the row has no cell for
 * every one, the other `piled` share its last cell as one pile.
 */
export const ruleCardSplit = (piles: number, rules: number) => {
  const cells = Math.max(1, CARD_ROW_CELLS - piles);
  return rules <= cells
    ? { loose: rules, piled: 0 }
    : { loose: cells - 1, piled: rules - cells + 1 };
};

/**
 * Seat 0's piece row, between the card piles and the map: an off-board
 * figure's footprint (0.85) clears both the map (z ≤ 8) and the cards
 * (z ≥ 10.4). Cells are piece CENTRES, 1.8 apart.
 */
export const PIECE_ROW_Z = 9.2;
const PIECE_STEP = 1.8;
const PIECE_X_MAX = VIEW.halfX - OFF_BOARD_FIGHTER_RADIUS;
/** The corner beside the map, on seat 0's own half: rows from here toward z 0. */
const CORNER_Z_TOP = PIECE_ROW_Z - PIECE_STEP;
const CORNER_Z_BOTTOM = 0.5;

export type SeatArea = {
  /** A pile's cell, or a rule card's: `rules`, `rules-2`, … after the piles. */
  card: (slot: string) => XZ;
  /**
   * The kit's piece cells, nearest the hero card first: the row in front of
   * the hero card on; the card row past the last rule card; the corner beside
   * the map; then in front of the deck and discard. Ends when full.
   */
  kit: () => Generator<XZ, void>;
};

/**
 * Seat 0's coordinates, mirrored for seat 1, for the piles and rule cards in
 * `slots`. Rule slots past the row's last cell land on that cell.
 */
export const seatArea = (
  seat: Seat,
  mapWidth: number,
  slots: readonly string[] = CARD_ORDER,
): SeatArea => {
  const at = (p: XZ) => forSeat(seat, p);
  const along = function* (from: number, z: number, to = PIECE_X_MAX) {
    for (let x = from; x <= to + 1e-9; x += PIECE_STEP) yield at([round(x), z]);
  };
  const piles = CARD_ORDER.filter((s) => s !== "rules" && slots.includes(s));
  const rules = slots.filter(isRuleSlot);
  const cards = [...piles, ...rules];
  const { loose, piled } = ruleCardSplit(piles.length, rules.length);
  const cells = piles.length + loose + (piled ? 1 : 0);
  const drawPiles = piles.filter((s) => s === "deck" || s === "discard");
  const heroX = pileX(drawPiles.length);
  return {
    card: (slot) =>
      at([pileX(Math.min(cards.indexOf(slot), cells - 1)), FRONT_ROW_Z]),
    kit: function* () {
      yield* along(heroX, PIECE_ROW_Z);
      yield* along(pileX(cells), FRONT_ROW_Z);
      const x0 = mapWidth / 2 + 1;
      for (let z = CORNER_Z_TOP; z >= CORNER_Z_BOTTOM - 1e-9; z -= PIECE_STEP) {
        yield* along(x0, round(z));
      }
      yield* along(pileX(0), PIECE_ROW_Z, heroX - PIECE_STEP);
    },
  };
};

/** Two combat spots per seat in the front row: attack/defence card and boost. */
export const FRONT_STRIP: readonly { name: string; position: XZ }[] = [
  { name: "attack/defense card", position: [-1.3, FRONT_ROW_Z] },
  { name: "boost", position: [1.3, FRONT_ROW_Z] },
];

export const MAX_FIGHTER_RADIUS = 1.2;

export type BoardGeometry = {
  width: number;
  height: number;
  /** World centre of each space, keyed by space id. */
  spaces: { id: string; position: XZ; start?: number }[];
  /** Snap catch radius: half a space. */
  spaceRadius: number;
  fighterRadius: number;
};

/**
 * A board's printed spaces: a ProMapDef, a `mapSpaces.json` entry, or a Labs
 * map's stored `layout` (#1056).
 */
export type BoardSpaces = {
  meta: { spaceDiameter?: number };
  spaces: { id: string; x: number; y: number; start?: { slot: number } }[];
};

/**
 * Where a board's spaces land on the felt. The image's top edge (y = 0)
 * faces seat 1 at -z; `x`/`y` are fractions of the image, and
 * `spaceDiameter` is a fraction of its WIDTH.
 */
export const boardGeometry = (
  def: BoardSpaces,
  ratio: number,
): BoardGeometry => {
  const { width, height } = mapSize(ratio);
  const diameter = (def.meta.spaceDiameter ?? 0.06) * width;
  return {
    width,
    height,
    spaces: def.spaces.map((s) => ({
      id: s.id,
      position: [round((s.x - 0.5) * width), round((s.y - 0.5) * height)],
      ...(s.start?.slot ? { start: s.start.slot } : {}),
    })),
    spaceRadius: round(diameter / 2),
    fighterRadius: round(Math.min(MAX_FIGHTER_RADIUS, 0.45 * diameter)),
  };
};

export const distance = (a: XZ, b: XZ) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * A spot beside `anchor` that sits on no space and touches no other figure:
 * rings of growing radius, the first clear candidate wins. When the board is
 * too crowded for a clear one, the spot furthest from any space centre does.
 */
export const besideOnBoard = (
  anchor: XZ,
  radius: number,
  board: BoardGeometry,
  taken: { position: XZ; radius: number }[],
): XZ => {
  const halfW = board.width / 2 - radius;
  const halfH = board.height / 2 - radius;
  let best: { p: XZ; score: number } | null = null;
  for (let ring = 2; ring <= 6; ring++) {
    const r = ring * radius;
    for (let step = 0; step < 12; step++) {
      const a = (step / 12) * 2 * Math.PI;
      const p: XZ = [
        round(anchor[0] + r * Math.cos(a)),
        round(anchor[1] + r * Math.sin(a)),
      ];
      if (Math.abs(p[0]) > halfW || Math.abs(p[1]) > halfH) continue;
      if (taken.some((t) => distance(t.position, p) < t.radius + radius)) {
        continue;
      }
      const clearance = Math.min(
        ...board.spaces.map((s) => distance(s.position, p)),
      );
      if (clearance >= board.spaceRadius + radius) return p;
      if (!best || clearance > best.score) best = { p, score: clearance };
    }
  }
  return best?.p ?? anchor;
};
