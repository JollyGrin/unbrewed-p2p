/**
 * The "What you earned" landing animation — the pure half (p2p #1670).
 *
 * When the poll lands, the card draws the eye to the bar: the gold segment
 * grows, the "+N XP" figure counts up with it, a sheen sweeps the track once,
 * and the bonus rows arrive one after another. A level-up first fills the OLD
 * level's bar to the end, flashes, and only then starts the new one.
 *
 * Three rules shape this module:
 *
 * - The DOM is final from the first landed render. Widths, text and
 *   `aria-valuenow` never animate; the motion is transforms, opacity and
 *   `aria-hidden` overlays on top of them. A test or a screen reader reads the
 *   same card whether or not anything moves.
 * - It plays ONCE per landing. A landing is the `delta` object `useGameEarned`
 *   builds when the refetch catches up; it is the same object across every
 *   re-render and every remount of the card (the modal reopened, the HUD and
 *   the panel swapping), and a rematch's landing is a new one.
 * - No motion at all under `prefers-reduced-motion: reduce`, or where there is
 *   no `matchMedia` to ask (a server render, jsdom): the final state is drawn
 *   at once.
 *
 * The two hooks live in `useEarnedLanding.ts`, the paint in `ProPostGameEarned`.
 */

/**
 * May this window animate? Only when it can be asked and does not say
 * "reduce". Without `matchMedia` the answer is no: that is not a browser a
 * player is looking at, and the final state is always correct.
 */
export const motionAllowed = (win: Pick<Window, "matchMedia"> | null | undefined = typeof window === "undefined" ? null : window): boolean =>
  !!win && typeof win.matchMedia === "function" && !win.matchMedia("(prefers-reduced-motion: reduce)").matches;

// --- play once ---------------------------------------------------------------

/** The landings whose animation has already been shown, for the life of the page. */
export type PlayedLandings = WeakSet<object>;

const PLAYED: PlayedLandings = new WeakSet<object>();

/**
 * Does this landing still owe its animation? `token` is the landed `delta`
 * (null while the card is not landed). Reading never marks it: the mark is a
 * separate step taken once the card has committed, so a render React throws
 * away (strict mode, a suspended tree) does not use the landing up.
 */
export const shouldPlayLanding = (token: object | null, allowed: boolean, played: PlayedLandings = PLAYED): boolean =>
  token !== null && allowed && !played.has(token);

/** The card showed this landing: it never plays again, whether it moved or not. */
export const markLandingPlayed = (token: object, played: PlayedLandings = PLAYED): void => {
  played.add(token);
};

/**
 * One card instance's memory of the landing it is showing. The decision is
 * made the first time the instance sees a token and then held, so marking the
 * landing as played (which happens right after) does not cut the animation
 * short on the next render.
 */
export interface LandingLatch {
  token: object | null;
  play: boolean;
}

export const EMPTY_LATCH: LandingLatch = { token: null, play: false };

/** `allowed` is asked only when the token changes, never on a plain re-render. */
export const nextLatch = (
  latch: LandingLatch,
  token: object | null,
  allowed: () => boolean = motionAllowed,
  played: PlayedLandings = PLAYED,
): LandingLatch =>
  latch.token === token ? latch : { token, play: token !== null && shouldPlayLanding(token, allowed(), played) };

// --- the timeline ------------------------------------------------------------

/** Every beat of the landing, in ms from the first landed render. */
export interface LandingTimeline {
  /**
   * Level-up only: the old level's bar runs to the end (`startMs`, `ms`), the
   * track flashes (`flashMs`), and at `resetMs` the bar empties and the title
   * ticks over. Null on an ordinary landing.
   */
  wrap: { startMs: number; ms: number; flashMs: number; resetMs: number } | null;
  /** The gold segment growing to its landed width. */
  fill: { startMs: number; ms: number };
  /** "+N XP" counting from 0: from the first movement of the bar to the last. */
  count: { startMs: number; ms: number };
  /** The one sheen sweep, as the fill finishes. */
  sheen: { startMs: number; ms: number };
  /** Bonus row `i` starts at `startMs + i * staggerMs`. */
  rows: { startMs: number; staggerMs: number; ms: number };
  /** When the last beat is over and the overlays can go. */
  totalMs: number;
}

/** The pause before anything moves, so the eye is already on the card. */
export const LANDING_BEAT_MS = 250;
export const LANDING_FILL_MS = 800;
export const LANDING_WRAP_MS = 600;
export const LANDING_FLASH_MS = 300;
export const LANDING_SHEEN_MS = 650;
export const LANDING_ROW_STAGGER_MS = 80;
export const LANDING_ROW_MS = 260;

export const landingTimeline = (levelUp: boolean, rowCount: number): LandingTimeline => {
  const wrap = levelUp
    ? {
        startMs: LANDING_BEAT_MS,
        ms: LANDING_WRAP_MS,
        flashMs: LANDING_FLASH_MS,
        resetMs: LANDING_BEAT_MS + LANDING_WRAP_MS + LANDING_FLASH_MS,
      }
    : null;
  const fillStart = wrap ? wrap.resetMs : LANDING_BEAT_MS;
  const fillEnd = fillStart + LANDING_FILL_MS;
  const rows = Math.max(0, rowCount);
  const rowsEnd = rows > 0 ? fillEnd + (rows - 1) * LANDING_ROW_STAGGER_MS + LANDING_ROW_MS : fillEnd;
  return {
    wrap,
    fill: { startMs: fillStart, ms: LANDING_FILL_MS },
    count: { startMs: LANDING_BEAT_MS, ms: fillEnd - LANDING_BEAT_MS },
    sheen: { startMs: fillEnd, ms: LANDING_SHEEN_MS },
    rows: { startMs: fillEnd, staggerMs: LANDING_ROW_STAGGER_MS, ms: LANDING_ROW_MS },
    totalMs: Math.max(fillEnd + LANDING_SHEEN_MS, rowsEnd),
  };
};

// --- the count-up ------------------------------------------------------------

/** Ease-out cubic, the same shape as the bar's `cubic-bezier(.22, 1, .36, 1)`. */
const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);

/**
 * The figure shown `elapsedMs` into the landing: 0 until the count starts, the
 * target from its end on, a whole number in between and never past the target.
 */
export const countUpValue = (target: number, elapsedMs: number, count: { startMs: number; ms: number }): number => {
  if (target <= 0) return Math.max(0, target);
  if (count.ms <= 0) return target;
  const t = (elapsedMs - count.startMs) / count.ms;
  if (t <= 0) return 0;
  if (t >= 1) return target;
  return Math.min(target, Math.round(target * easeOut(t)));
};
