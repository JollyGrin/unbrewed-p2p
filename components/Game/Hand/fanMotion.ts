/**
 * Motion maths for the hand fan (game.carousel.tsx). Pure functions only, so
 * the feel can be tuned and tested without a DOM; the fan's rAF loop applies
 * the results as inline transforms (no React re-render per frame).
 *
 * Everything animates through critically-damped-ish springs rather than CSS
 * transitions: a spring keeps its velocity when the target moves mid-flight
 * (sweeping the cursor across the hand, retargeting a drag), so motion stays
 * continuous instead of restarting a fixed curve on every pointer event. A
 * critically damped spring is also naturally "fast start, soft settle", which
 * is the ease-out feel we want for the hover reveal.
 */

export type SpringConfig = {
  /** stiffness: higher = faster */
  k: number;
  /** damping ratio: 1 = critical (no overshoot), <1 = a little wobble */
  zeta: number;
};

/** Hover reveal: >60% up in ~65ms, within 5% by ~150ms, no overshoot. */
export const FOCUS_IN: SpringConfig = { k: 1000, zeta: 1 };
/** Hover release: a touch softer so the card sinks rather than snaps. */
export const FOCUS_OUT: SpringConfig = { k: 320, zeta: 1 };
/** Neighbour spread / proximity rise. */
export const LAYOUT: SpringConfig = { k: 520, zeta: 1 };
/** Cursor tilt on the focused card: slightly underdamped so it feels physical. */
export const TILT: SpringConfig = { k: 260, zeta: 0.75 };
/** Drag ghost following the pointer: tight, tiny lag, no overshoot. */
export const FOLLOW: SpringConfig = { k: 900, zeta: 0.9 };
/** Drag ghost sway from horizontal velocity. */
export const SWAY: SpringConfig = { k: 380, zeta: 0.6 };
/** Cancelled drag flying back to its slot. */
export const RETURN: SpringConfig = { k: 420, zeta: 0.95 };

/** Largest step the integrator takes; frames longer than this are sub-stepped. */
const MAX_SUBSTEP = 1 / 240;
/** A frame longer than this (tab was hidden, devtools paused) is clamped. */
const MAX_FRAME = 1 / 20;

/**
 * Advance one spring by `dt` seconds (semi-implicit Euler, sub-stepped so
 * stiff springs stay stable at low frame rates). Returns [position, velocity].
 */
export const stepSpring = (
  x: number,
  v: number,
  target: number,
  dt: number,
  { k, zeta }: SpringConfig,
): [number, number] => {
  const c = 2 * zeta * Math.sqrt(k);
  let left = Math.min(dt, MAX_FRAME);
  while (left > 0) {
    const h = Math.min(left, MAX_SUBSTEP);
    v += (-k * (x - target) - c * v) * h;
    x += v * h;
    left -= h;
  }
  return [x, v];
};

/** Spring value at rest (close enough to snap and stop animating). */
export const settled = (x: number, v: number, target: number, eps = 0.01) =>
  Math.abs(x - target) < eps && Math.abs(v) < eps * 10;

/** How far the focused card rises and how big it gets (matches the old CSS). */
export const FOCUS_LIFT_RATIO = 0.55; // of card height
export const FOCUS_SCALE = 1.85;
/** Max cursor tilt on the focused card, degrees. */
export const MAX_TILT = 7;
/** Proximity rise of cards near the cursor, px. */
export const NEIGHBOUR_RISE = 14;
/** Drag ghost sway: degrees per px/s of horizontal velocity, and its cap. */
export const SWAY_PER_VELOCITY = 0.012;
export const MAX_SWAY = 12;

/**
 * Which card the cursor is focusing, from its x across the fan. Nearest card
 * centre wins, with a little hysteresis so the focus doesn't flicker between
 * two cards when the cursor rests on their shared edge.
 */
export const pickFocus = (
  pointerX: number,
  count: number,
  spacing: number,
  cardWidth: number,
  current: number | null,
): number => {
  if (count <= 1) return 0;
  const centre = (i: number) => i * spacing + cardWidth / 2;
  const nearest = Math.max(
    0,
    Math.min(count - 1, Math.round((pointerX - cardWidth / 2) / spacing)),
  );
  if (current == null || current === nearest || current >= count)
    return nearest;
  const hysteresis = Math.min(10, spacing * 0.12);
  return Math.abs(pointerX - centre(nearest)) + hysteresis <
    Math.abs(pointerX - centre(current))
    ? nearest
    : current;
};

/**
 * How far neighbours slide away from the focused card so it isn't buried.
 * Tighter hands (more overlap) spread more; the push fades with distance.
 */
export const spreadFor = (
  index: number,
  focus: number | null,
  spacing: number,
  cardWidth: number,
): number => {
  if (focus == null || index === focus) return 0;
  const max = Math.max(0, Math.min(48, cardWidth * 0.6 - spacing * 0.5));
  const d = Math.abs(index - focus);
  return Math.sign(index - focus) * max * Math.exp(-((d - 1) ** 2) / 2);
};

/**
 * Gentle rise of every card by how close the cursor is to it, so sweeping the
 * cursor along the hand sends a ripple through it instead of a lone card
 * snapping up and down.
 */
export const riseFor = (
  index: number,
  pointerX: number | null,
  spacing: number,
  cardWidth: number,
): number => {
  if (pointerX == null) return 0;
  const width = Math.max(spacing, cardWidth * 0.5);
  const dx = (pointerX - (index * spacing + cardWidth / 2)) / width;
  return NEIGHBOUR_RISE * Math.exp(-(dx * dx) / 2);
};

/** Ghost sway target from horizontal velocity (px/s), capped. */
export const swayFor = (vx: number) =>
  Math.max(-MAX_SWAY, Math.min(MAX_SWAY, vx * SWAY_PER_VELOCITY));

export const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Whether decorative motion may run at all: not under reduced motion, and not
 * where there is no frame clock or media query to ask (server, jsdom), so
 * state always lands in one step there.
 */
export const motionAllowed = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  typeof requestAnimationFrame === "function" &&
  !prefersReducedMotion();

/** A card arriving in the fan (drawn, or back from the table). */
export const ARRIVE: SpringConfig = { k: 340, zeta: 0.82 };
/** More new cards than this at once is a hand being dealt or restored. */
export const MAX_ARRIVALS = 3;
/** Each further card of one batch starts this much later, seconds. */
export const ARRIVAL_STAGGER = 0.045;

type KeyedCard = { title?: string; type?: string; value?: unknown; boost?: unknown };
const cardKey = (c: KeyedCard) =>
  `${c.title ?? ""}|${c.type ?? ""}|${c.value ?? ""}|${c.boost ?? ""}`;

/**
 * Indices of the cards in `next` that were not in `prev`. Cards are matched by
 * what they are, not by object identity (a hand that came over the wire is all
 * new objects), earliest first: with two copies of a card, the later one is
 * the arrival, which is where a drawn card goes.
 *
 * Empty when there was no hand before (the deal, a rejoin) or when more than
 * MAX_ARRIVALS cards turned up at once.
 */
export const handArrivals = (
  prev: readonly KeyedCard[] | undefined,
  next: readonly KeyedCard[] | undefined,
): number[] => {
  if (!prev || !next || next.length <= prev.length) return [];
  const have = new Map<string, number>();
  prev.forEach((c) => have.set(cardKey(c), (have.get(cardKey(c)) ?? 0) + 1));
  const arrivals: number[] = [];
  next.forEach((c, i) => {
    const k = cardKey(c);
    const n = have.get(k) ?? 0;
    if (n > 0) have.set(k, n - 1);
    else arrivals.push(i);
  });
  return arrivals.length > MAX_ARRIVALS ? [] : arrivals;
};

/**
 * A screen-space offset expressed in the frame of a fan slot rotated by
 * `rotDeg`, so a card can be drawn that far from its slot.
 */
export const toSlotFrame = (
  dx: number,
  dy: number,
  rotDeg: number,
): { x: number; y: number } => {
  const a = (-rotDeg * Math.PI) / 180;
  return {
    x: dx * Math.cos(a) - dy * Math.sin(a),
    y: dx * Math.sin(a) + dy * Math.cos(a),
  };
};

/**
 * Where an arriving card starts, as an offset and scale in its slot's frame.
 *
 * The slot is turned by `rotDeg` about its bottom centre (`pivot`, on
 * screen); the arriving card is drawn upright, scaled about that same point.
 * So its centre sits at pivot + R(rot)·offset + (0, -scale·height/2), and the
 * offset that puts it on `origin` is the inverse of that.
 */
export const arrivalStart = (
  origin: { x: number; y: number; width: number },
  pivot: { x: number; y: number },
  rotDeg: number,
  card: { width: number; height: number },
): { x: number; y: number; scale: number } => {
  const scale = Math.max(0.1, origin.width / card.width);
  const local = toSlotFrame(
    origin.x - pivot.x,
    origin.y - pivot.y + (scale * card.height) / 2,
    rotDeg,
  );
  return { x: local.x, y: local.y, scale };
};

/** Scale that draws a card `cardWidth` px wide at a board token's width. */
export const ghostScaleOnBoard = (
  tokenWidth: number,
  zoom: number,
  cardWidth: number,
): number => (tokenWidth * zoom) / cardWidth;

/** Where the next card to arrive in the fan comes from, when that is known. */
type Origin = { x: number; y: number; width: number };
let nextOrigin: { origin: Origin; at: number } | null = null;

/** A card is about to arrive from this spot on screen (a table token). */
export const noteHandArrival = (origin: Origin | null) => {
  nextOrigin = origin ? { origin, at: Date.now() } : null;
};

/** The origin noted for the arriving card, if it is recent; used once. */
export const takeHandArrival = (): Origin | null => {
  const o = nextOrigin;
  nextOrigin = null;
  return o && Date.now() - o.at < 800 ? o.origin : null;
};
