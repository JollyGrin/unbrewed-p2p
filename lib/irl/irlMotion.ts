import { useRouter } from "next/router";
import { useReducedMotion } from "framer-motion";

/**
 * IRL Mode motion policy (issue #809) — every duration and easing in one
 * place, like TOKEN_LIFE_TUNING. Seconds, as framer-motion takes them.
 */
export const IRL_MOTION = {
  /**
   * The in-play card turning over (Reveal / Hide). A spring with a little
   * bounce, so it lands just past flat and settles back. Each boost starts
   * `stagger` after the one before it, main card first.
   */
  flip: { dur: 0.42, stagger: 0.08, bounce: 0.28 },
  /** the Total row landing once the flip has: scale in from `scaleFrom` */
  punch: { dur: 0.3, scaleFrom: 1.35 },
  /** reduced motion: a crossfade stands in for every flip and punch */
  fade: { dur: 0.15 },
} as const;

/** Every IRL component asks this one place whether to animate. */
export const useIrlReducedMotion = (): boolean => !!useReducedMotion();

/**
 * Dev-only `?fxPause=<0..1>` (issue #809 screenshots): once the in-play card
 * starts to turn, it holds at that fraction of its travel instead of landing.
 * Always null in a production build.
 */
export const useIrlFxPause = (): number | null => {
  const { query } = useRouter();
  if (process.env.NODE_ENV === "production") return null;
  const raw = Array.isArray(query.fxPause) ? query.fxPause[0] : query.fxPause;
  const pause = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(pause) ? Math.min(1, Math.max(0, pause)) : null;
};
