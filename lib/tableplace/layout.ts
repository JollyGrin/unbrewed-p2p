/**
 * Table layout v2: every coordinate the converter sends to table.place.
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
 *   ┌──────────────── seat 1 front row (cards) ────────────────┐
 *   │ seat 1  │                                        │        │
 *   │ column  │        map, centred, ≤ 26 × 16         │        │
 *   │         │                                        │ seat 0 │
 *   │         │                                        │ column │
 *   └─ deck discard rules ── combat ── hero sidekick extras ───┘
 */
import type { ProMapDef } from "@/lib/pro/protocol";

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

/** The map box: leaves a front row per seat and a side column per side. */
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

/** Seat 0's front row: card piles at both ends, combat spots in the middle. */
export const FRONT_ROW_Z = 10.6;
export const CARD_X = {
  deck: -18,
  discard: -15.6,
  rules: -13.2,
  hero: 13.2,
  sidekick: 15.6,
  extras: 18,
} as const;
export type CardSlot = keyof typeof CARD_X;

/**
 * Seat 0's side column, to its right beside the map, clear of the front row.
 * Its cells are piece CENTRES, so the outer edge leaves room for a footprint.
 */
const COLUMN_X_MAX = VIEW.halfX - OFF_BOARD_FIGHTER_RADIUS;
const COLUMN_Z_TOP = 8.5;
const COLUMN_Z_BOTTOM = 0.5;
const PIECE_STEP = 1.8;

export type SeatArea = {
  card: (slot: CardSlot) => XZ;
  /** HP counters, then off-board fighters, then saved tokens; ends when full. */
  column: () => Generator<XZ, void>;
};

/** Seat 0's coordinates, mirrored for seat 1. The column starts 1 off the map. */
export const seatArea = (seat: Seat, mapWidth: number): SeatArea => {
  const at = (p: XZ) => forSeat(seat, p);
  const x0 = mapWidth / 2 + 1;
  return {
    card: (slot) => at([CARD_X[slot], FRONT_ROW_Z]),
    column: function* () {
      for (let z = COLUMN_Z_TOP; z >= COLUMN_Z_BOTTOM - 1e-9; z -= PIECE_STEP) {
        for (let x = x0; x <= COLUMN_X_MAX + 1e-9; x += PIECE_STEP) {
          yield at([round(x), round(z)]);
        }
      }
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
 * Where a ProMapDef's spaces land on the felt. The image's top edge (y = 0)
 * faces seat 1 at -z; `x`/`y` are fractions of the image, and
 * `spaceDiameter` is a fraction of its WIDTH.
 */
export const boardGeometry = (def: ProMapDef, ratio: number): BoardGeometry => {
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
