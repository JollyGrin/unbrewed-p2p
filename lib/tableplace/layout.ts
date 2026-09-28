/**
 * Table layout v1: every coordinate the converter sends to table.place.
 *
 * World units, per api.table.place/llms.txt §4.5: the felt is x ∈ [-30, 30],
 * z ∈ [-15, 15]; seat 0 sits at +z looking toward -z (so +x is its right),
 * seat 1 at -z. Nothing is mirrored for us, so everything here is authored for
 * seat 0 and `mirror()` turns it into seat 1's `(-x, -z)`.
 *
 *   ┌─────────────┬──────── seat 1 front strip ────────┬─────────────┐
 *   │ seat 1 area │                                   │             │
 *   │             │      map, centred, ≤ 34 × 22      │             │
 *   │             │                                   │ seat 0 area │
 *   └─────────────┴──────── seat 0 front strip ────────┴─────────────┘
 */
import type { ProMapDef } from "@/lib/pro/protocol";

export type Seat = 0 | 1;
export type XZ = [number, number];

export const FELT_HALF_X = 30;
export const FELT_HALF_Z = 15;

/** table.place's own footprints: cards closer than this merge into one pile. */
export const CARD_STACK_RADIUS = 1.7;
export const TOKEN_RADIUS = 0.75;

export const PLACEMENT_CAP = 100;
export const SNAP_POINT_CAP = 200;

export const SEAT_ROTATION = [0, 180] as const;

/** The map box: leaves a front strip per seat and a player area per side. */
export const MAP_MAX_HEIGHT = 22;
export const MAP_MAX_WIDTH = 34;

/** A board overlay's world size. table.place's `scale` is its HEIGHT (z). */
export const mapSize = (ratio: number) => {
  const height = Math.min(MAP_MAX_HEIGHT, MAP_MAX_WIDTH / ratio);
  return { width: ratio * height, height };
};

/** Seat 1's copy of a seat 0 coordinate. */
export const mirror = ([x, z]: XZ): XZ => [-x || 0, -z || 0];

export const forSeat = (seat: Seat, p: XZ): XZ => (seat === 0 ? p : mirror(p));

const round = (n: number) => Math.round(n * 100) / 100;

// Seat 0's area: x ∈ [18, 29.5], z ∈ [0, 14.5], to seat 0's right.
const AREA_X0 = 19.5;
const AREA_X_MAX = 29;
const ROW_A_Z = 12.5;
const ROW_B_Z = 9.5;
const CARD_STEP = 2.5;
/** First piece in row B, clear of the rules pile at AREA_X0. */
const ROW_B_X0 = AREA_X0 + 2.2;
/** Row C and on: the pieces flow downward, and on past the centre line. */
const ROW_C_Z = 7.3;
const PIECE_STEP = 1.8;
const LAST_ROW_Z = -FELT_HALF_Z + 1;

/** Row A, nearest the player. A missing slot keeps its spot empty. */
export const CARD_SLOTS = ["deck", "discard", "hero", "sidekick"] as const;
export type CardSlot = (typeof CARD_SLOTS)[number] | "rules";

export type SeatArea = {
  card: (slot: CardSlot) => XZ;
  /** Row B after the rules pile: one per fighter HP counter. */
  counters: () => Generator<XZ, void>;
  /** Row C and on: off-board fighters, then saved tokens. */
  pieces: () => Generator<XZ, void>;
};

function* flow(rows: { z: number; x0: number }[]): Generator<XZ, void> {
  for (const { z, x0 } of rows) {
    for (let x = x0; x <= AREA_X_MAX + 1e-9; x += PIECE_STEP) {
      yield [round(x), z];
    }
  }
}

const pieceRows = () => {
  const rows: { z: number; x0: number }[] = [];
  for (let z = ROW_C_Z; z >= LAST_ROW_Z; z -= PIECE_STEP) {
    rows.push({ z: round(z), x0: AREA_X0 });
  }
  return rows;
};

/** Seat 0's coordinates; `composeTable` mirrors them for seat 1. */
export const seatArea = (seat: Seat): SeatArea => {
  const at = (p: XZ) => forSeat(seat, p);
  return {
    card: (slot) =>
      slot === "rules"
        ? at([AREA_X0, ROW_B_Z])
        : at([AREA_X0 + CARD_SLOTS.indexOf(slot) * CARD_STEP, ROW_A_Z]),
    counters: function* () {
      // row B first; an overflow wraps into the rows C would use
      for (const p of flow([{ z: ROW_B_Z, x0: ROW_B_X0 }])) yield at(p);
    },
    pieces: function* () {
      for (const p of flow(pieceRows())) yield at(p);
    },
  };
};

/** Two combat spots per seat, off the board: attack/defence card and boost. */
export const FRONT_STRIP: readonly { name: string; position: XZ }[] = [
  { name: "attack/defense card", position: [-1.2, 13.2] },
  { name: "boost", position: [1.2, 13.2] },
];

/** A fighter figure standing off the board. */
export const OFF_BOARD_FIGHTER_RADIUS = 0.85;
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
