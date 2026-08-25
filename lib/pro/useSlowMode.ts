/**
 * "Slow mode" (issue #703) — a per-browser setting in the same shape as
 * `useHideOpponentCosmetics` and `useGameFx`'s sound/visual toggles: a
 * localStorage boolean read AFTER mount, so the server render and the first
 * client paint agree, flipped by a chip in the HUD's cluster.
 *
 * Defaults OFF. Slow mode makes the game wait on the player, which is the right
 * trade only for someone who asked for it — a player who is comfortable with the
 * pace must not have to turn anything off. `"on"` is therefore the stored
 * sentinel; anything else (including no entry at all) is off.
 *
 * The setting itself does nothing here — it is read by `useProSocket`, which
 * paces opponent STATE batches through `slowModeQueue`.
 */
import { useCallback, useEffect, useState } from "react";

export const SLOW_MODE_KEY = "pro-slow-mode";

export const useSlowMode = (): [boolean, () => void] => {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    try {
      setSlow(window.localStorage.getItem(SLOW_MODE_KEY) === "on");
    } catch {
      /* storage blocked — slow mode stays off */
    }
  }, []);

  const toggle = useCallback(() => {
    setSlow((cur) => {
      const next = !cur;
      try {
        window.localStorage.setItem(SLOW_MODE_KEY, next ? "on" : "off");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return [slow, toggle];
};
