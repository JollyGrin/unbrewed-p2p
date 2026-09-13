import { useRouter } from "next/router";
import { useReducedMotion } from "framer-motion";

type Bezier = [number, number, number, number];

const EASE_OUT: Bezier = [0.22, 1, 0.36, 1];
const EASE_IN: Bezier = [0.55, 0, 1, 0.45];
/** a card in the air: eases off its pile, settles onto the next */
const EASE_FLIGHT: Bezier = [0.4, 0.15, 0.2, 1];

/**
 * IRL Mode motion policy (issue #809) — every duration and easing in one
 * place, like TOKEN_LIFE_TUNING. Seconds, as framer-motion takes them.
 */
export const IRL_MOTION = {
  ease: { out: EASE_OUT, in: EASE_IN, flight: EASE_FLIGHT },
  /**
   * The in-play card turning over (Reveal / Hide). A spring with a little
   * bounce, so it lands just past flat and settles back. Each boost starts
   * `stagger` after the one before it, main card first.
   */
  flip: { dur: 0.42, stagger: 0.08, bounce: 0.28 },
  /** the Total row landing once the flip has: scale in from `scaleFrom` */
  punch: { dur: 0.3, scaleFrom: 1.35 },
  /**
   * Reduced motion: a crossfade stands in for every flip and punch. Also the
   * menu backdrop's fade, and how sheets and menus arrive under reduced motion.
   */
  fade: { dur: 0.15 },

  // --- the feel pass (#810) -------------------------------------------------
  /** full-screen sheets slide in from the right / menus slide up */
  sheet: { dur: 0.22 },
  /** a digit swap in the Ticker */
  ticker: { dur: 0.18 },
  /** counter border flash: red on −, green on + (kept under reduced motion) */
  flash: { dur: 0.3 },
  /** the heart beat on damage */
  heart: { dur: 0.32, scale: 1.35 },
  /** the once-only wobble when a character hits 0 HP */
  shake: { dur: 0.36, x: [0, -6, 5, -3, 2, 0] },
  /** fading into / out of the knocked-out look */
  knockOut: { dur: 0.25, opacity: 0.6, filter: "grayscale(0.6)" },
  /** a pile tile's bump whenever its count changes */
  pulse: { dur: 0.2, scale: 1.06 },
  /** pager: the active dot's width, and a new card's dot popping in */
  dots: {
    spring: { type: "spring", stiffness: 520, damping: 34 },
    pop: { type: "spring", stiffness: 640, damping: 16 },
  },
  /** the tray's hand carousel */
  carousel: {
    /** a drag past this many px, or a fling faster than this, turns the card */
    swipePx: 40,
    flingPxS: 500,
    /** rubber band past the first / last card */
    edgeResist: 0.3,
    spring: { type: "spring", stiffness: 380, damping: 36, restDelta: 0.002 },
    /** neighbours sit smaller and dimmer — the one on the left is the peek */
    sideScale: 0.9,
    sideOpacity: 0.35,
  },

  // --- card flights (#811) --------------------------------------------------
  /** `useSwipe`'s long-press window — the tray card's ring fills over it */
  longPress: { dur: 0.55 },
  /**
   * One card travelling between piles. A multi-card move sends each card
   * `stagger` after the last (the opening deal, `dealStagger`, starting
   * `dealLead` in — a Reset's dialog is still fading off the tray). A card
   * that changes face turns over across a fraction of its trip — the last
   * third (`turnLate`, a draw) or on the way (`turnEnRoute`); one that fades
   * into its pile starts to at `fadeAt`. Never more than `maxGhosts` cards in
   * the air.
   */
  flight: {
    dur: 0.32,
    stagger: 0.07,
    dealStagger: 0.09,
    dealLead: 0.22,
    tilt: 7,
    turnLate: [0.62, 0.95],
    turnEnRoute: [0.2, 0.8],
    fadeAt: 0.66,
    maxGhosts: 6,
    /** shuffle-in sends one card per discard, up to this many */
    maxShuffleIn: 5,
  },
  /** remove from game: the card greys, shrinks and fades where it is */
  dissolve: { dur: 0.4, scale: 0.9 },
  /** shuffle: three backs fan out on the deck tile and collapse */
  riffle: { dur: 0.6, spread: 14, lift: 0.14 },
  /** the deck tile's shake when there is nothing left to draw */
  wobble: { dur: 0.4, rotate: [0, -6, 5, -3, 2, 0] },
  /** "Show to opponent": the vignette settling over the hand grid */
  vignette: { dur: 0.2, scaleFrom: 1.06 },
} as const;

/** Every IRL component asks this one place whether to animate. */
export const useIrlReducedMotion = (): boolean => !!useReducedMotion();

/**
 * Dev-only `?fxPause=<0..1>` (issue #809 screenshots): once the in-play card
 * starts to turn, it holds at that fraction of its travel instead of landing.
 * Card flights (#811) hold at that fraction of their trip too, and stay.
 * Always null in a production build.
 */
export const useIrlFxPause = (): number | null => {
  const { query } = useRouter();
  if (process.env.NODE_ENV === "production") return null;
  const raw = Array.isArray(query.fxPause) ? query.fxPause[0] : query.fxPause;
  const pause = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(pause) ? Math.min(1, Math.max(0, pause)) : null;
};
