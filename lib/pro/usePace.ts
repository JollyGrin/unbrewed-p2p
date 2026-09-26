/**
 * "Combat pace" (player feedback: Pro combat reads too fast) — a per-device
 * setting in the same shape as `useSlowMode`: a localStorage value read AFTER
 * mount, so the server render and the first client paint agree, guarded like
 * `lib/voice/voiceStorage.ts` so a private window / blocked storage can never
 * throw.
 *
 * Defaults to Relaxed (DEFAULT_PACE, pace.ts) — player feedback after Combat
 * pace shipped was that even a first-time player, who has never opened this
 * menu, needs the slower reveal to read a card before it's gone. A returning
 * player who explicitly dialed back to Normal still gets exactly today's
 * (Normal's) 1× timing — the default only changes what an UNTOUCHED device
 * sees. The stored value is the pace id; anything that doesn't name a real
 * pace (an older build, a hand-edited entry) falls back to the default
 * rather than being trusted.
 *
 * The setting itself does nothing here — it is read by the page and threaded
 * as a scale factor into useGameFx / useCombatCallouts / useCombatStrike /
 * useCombatValueFx, which pace the actual combat sequence.
 */
import { useCallback, useEffect, useState } from "react";
import { DEFAULT_PACE, Pace, isPace, nextPace } from "./pace";

export const PACE_KEY = "pro-combat-pace";

export const usePace = (): [Pace, () => void] => {
  const [pace, setPace] = useState<Pace>(DEFAULT_PACE);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(PACE_KEY);
      if (stored && isPace(stored)) setPace(stored);
    } catch {
      /* storage blocked — pace stays at the default */
    }
  }, []);

  // One tap steps to the next option (Normal → Relaxed → Slow → Normal), the
  // same cycling gesture the HUD's other one-shot chips use — there is
  // nothing to pick from, only to tap through.
  const cyclePace = useCallback(() => {
    setPace((cur) => {
      const next = nextPace(cur);
      try {
        window.localStorage.setItem(PACE_KEY, next);
      } catch {
        /* storage blocked — the choice just won't survive a reload */
      }
      return next;
    });
  }, []);

  return [pace, cyclePace];
};
