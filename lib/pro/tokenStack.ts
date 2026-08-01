/**
 * Co-located token layout (issue #553, protocol v28 — the SMALL fighter class).
 *
 * Before v28 a space held at most ONE fighter, and the board's only stacking case
 * was a transient render of a view mid-update; a 0.35rem diagonal nudge was enough.
 * v28 makes sharing a RULE: up to `SMALL_PER_SPACE_CAP` smalls plus at most one
 * non-small, from either player, legally occupy one space — and corpses stack too.
 *
 * Why the old nudge had to go, concretely: a fighter token is `diam * 0.82` of the
 * BOARD's width, while the nudge was in `rem`. At a typical board size the token is
 * ~55px and 0.35rem is ~5.6px, so five tokens spanned ~22px of a ~55px circle —
 * they covered each other almost exactly, only the last one in DOM order could be
 * clicked, and the other four were unreachable by mouse. Sizing in board-% and
 * offsetting in `rem` never composed; it only looked fine because N was always 1.
 *
 * The fix is to express offsets as a PERCENTAGE OF THE TOKEN'S OWN WIDTH, which is
 * what `transform: translate(%)` already means. That scales with the board, with
 * `imgMaxH`, and with the zoom transform for free — no unit mixing, nothing to
 * re-tune per board.
 *
 * Layout: the non-small (if any) keeps the centre at full size and renders FIRST so
 * it sits behind; smalls are drawn smaller and ringed around it, starting at 12
 * o'clock and going clockwise. A lone occupant is always centred, so every
 * pre-v28 board renders exactly as it did.
 *
 * PRESENTATION ONLY — this never decides what is legal, only where a token is drawn.
 */

/** Engine's `SMALL_PER_SPACE_CAP` (v0.35.0). Used only to size the ring sensibly. */
export const SMALL_PER_SPACE_CAP = 4;

/** Token width as a multiple of the space diameter, by size class. */
export const SCALE_BY_SIZE = { NORMAL: 0.82, LARGE: 0.82, SMALL: 0.52 } as const;

/**
 * Ring radius, as a percentage of the RINGED token's own width. 46% puts adjacent
 * smalls just under one token-width apart — visibly separate, each with its own
 * click target, and the whole cluster still reads as "these are on one space".
 */
export const RING_RADIUS_PCT = 46;

export interface StackSlot {
  /** X offset, percent of the token's own width (feeds `translate(calc(-50% + …))`). */
  dx: number;
  /** Y offset, percent of the token's own width. */
  dy: number;
  /** Token width as a multiple of the space diameter. */
  scale: number;
  /**
   * Render order within the space — ascending. Equal `zIndex` means DOM order
   * decides overlap, so emitting in this order puts the big body behind the
   * smalls that are standing on top of it, which is the readable arrangement.
   */
  order: number;
}

/** One thing to place on a space. `key` is whatever the caller indexes by. */
export interface StackOccupant {
  key: string;
  size: "NORMAL" | "LARGE" | "SMALL";
}

/**
 * `n` evenly-spaced points on a circle of `radius`, starting at 12 o'clock and
 * running clockwise. n <= 1 yields a single centred point — a lone token must not
 * be nudged off its space.
 */
export const ringOffsets = (n: number, radius: number): { dx: number; dy: number }[] => {
  if (n <= 1) return n === 1 ? [{ dx: 0, dy: 0 }] : [];
  return Array.from({ length: n }, (_, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return {
      dx: Math.round(Math.cos(angle) * radius * 100) / 100,
      dy: Math.round(Math.sin(angle) * radius * 100) / 100,
    };
  });
};

/**
 * Where each occupant of ONE space is drawn.
 *
 * - A single occupant is centred at its own size-class scale (so a lone SMALL is
 *   still drawn small — size is a property of the fighter, not of the crowd).
 * - With a crowd: every non-small stays centred, and the smalls ring around.
 * - Two-or-more non-smalls cannot happen under the engine's occupancy policy, but
 *   the client never trusts that: they get their own ring rather than being drawn
 *   exactly on top of one another, so a server bug shows up as a visible stack
 *   instead of a silently hidden fighter.
 */
export const stackLayout = (occupants: StackOccupant[]): Map<string, StackSlot> => {
  const out = new Map<string, StackSlot>();
  if (occupants.length === 0) return out;

  const smalls = occupants.filter((o) => o.size === "SMALL");
  const bigs = occupants.filter((o) => o.size !== "SMALL");

  if (occupants.length === 1) {
    const only = occupants[0];
    out.set(only.key, { dx: 0, dy: 0, scale: SCALE_BY_SIZE[only.size], order: 0 });
    return out;
  }

  let order = 0;
  const bigOffsets = bigs.length > 1 ? ringOffsets(bigs.length, RING_RADIUS_PCT) : null;
  bigs.forEach((b, i) => {
    const off = bigOffsets ? bigOffsets[i] : { dx: 0, dy: 0 };
    out.set(b.key, { ...off, scale: SCALE_BY_SIZE[b.size], order: order++ });
  });

  const smallOffsets = ringOffsets(smalls.length, RING_RADIUS_PCT);
  smalls.forEach((s, i) => {
    // A lone small sharing with a big must still step off the centre, or it hides
    // inside the big token — ringOffsets centres a single point, so nudge it up.
    const off = smalls.length === 1 && bigs.length > 0 ? { dx: 0, dy: -RING_RADIUS_PCT } : smallOffsets[i];
    out.set(s.key, { ...off, scale: SCALE_BY_SIZE.SMALL, order: order++ });
  });

  return out;
};

/**
 * The offsets for N co-located BOARD OBJECTS (corpses/totems). Objects carry no
 * size class — they are all one scale — so they simply ring. Same reason as
 * fighters: two corpses on one space drew on top of each other, and their
 * countdown pips (which hang below the disc) became an illegible smear.
 */
export const objectStackOffsets = (n: number): { dx: number; dy: number }[] =>
  ringOffsets(n, RING_RADIUS_PCT);
