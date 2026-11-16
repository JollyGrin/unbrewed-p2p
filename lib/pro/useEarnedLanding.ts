/**
 * The landing animation's two hooks (p2p #1670); the rules they keep are in
 * `earnedMotion.ts`.
 */
import { useEffect, useRef, useState } from "react";

import { EMPTY_LATCH, LandingLatch, countUpValue, markLandingPlayed, nextLatch } from "./earnedMotion";

/**
 * Is this card instance playing the landing animation right now?
 *
 * `token` is the landed `delta` (null while not landed). True from the first
 * render that sees a landing nobody has shown yet, until `totalMs` later; false
 * for a landing already shown (a remount), under reduced motion, and once the
 * timeline has run out. A re-render never restarts it: the decision is latched
 * per token, and the token is only marked as played after the commit.
 */
export const useLandingMotion = (token: object | null, totalMs: number): boolean => {
  const latch = useRef<LandingLatch>(EMPTY_LATCH);
  latch.current = nextLatch(latch.current, token);
  const [finished, setFinished] = useState<object | null>(null);
  useEffect(() => {
    if (!token) return;
    markLandingPlayed(token);
    if (!latch.current.play) return;
    const id = window.setTimeout(() => setFinished(token), totalMs);
    return () => window.clearTimeout(id);
  }, [token, totalMs]);
  return latch.current.play && finished !== token;
};

/**
 * The figure to show in place of the final one while the landing plays, or
 * null when the real text should show (not playing, or the count is over).
 * The elapsed time is kept per token, so the first render of a new landing
 * reads 0 rather than the last landing's end.
 */
export const useCountUp = (
  token: object | null,
  target: number | null,
  playing: boolean,
  count: { startMs: number; ms: number },
): number | null => {
  const [clock, setClock] = useState<{ token: object | null; elapsed: number }>({ token: null, elapsed: 0 });
  const { startMs, ms } = count;
  useEffect(() => {
    if (!playing || !token) return;
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const elapsed = Math.max(0, now - started);
      setClock({ token, elapsed });
      if (elapsed < startMs + ms) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, token, startMs, ms]);
  if (!playing || !token || target === null) return null;
  const elapsed = clock.token === token ? clock.elapsed : 0;
  return elapsed >= startMs + ms ? null : countUpValue(target, elapsed, count);
};
