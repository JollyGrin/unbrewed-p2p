/**
 * "Turn reminder" setting — a per-device toggle in the same shape as
 * `useSlowMode`/`usePace`: a localStorage value read AFTER mount, so the
 * server render and the first client paint agree, guarded so a private
 * window / blocked storage can never throw.
 *
 * Defaults ON, the opposite of `useSlowMode`: a nudge for a forgotten turn is
 * a safety net most players want by default, so `"off"` is the stored
 * sentinel and anything else (including no entry at all) reads as on — a
 * player who finds it noisy turns it off explicitly, rather than everyone
 * having to discover and enable it.
 *
 * The setting itself does nothing here — it is read by `useTurnReminder`,
 * which times the wait and drives the vibration/sound/on-screen/title cues.
 */
import { useCallback, useEffect, useState } from "react";

export const TURN_REMINDER_KEY = "pro-turn-reminder";

export const useTurnReminderSetting = (): [boolean, () => void] => {
  const [on, setOn] = useState(true);

  useEffect(() => {
    try {
      setOn(window.localStorage.getItem(TURN_REMINDER_KEY) !== "off");
    } catch {
      /* storage blocked — stays on */
    }
  }, []);

  const toggle = useCallback(() => {
    setOn((cur) => {
      const next = !cur;
      try {
        window.localStorage.setItem(TURN_REMINDER_KEY, next ? "on" : "off");
      } catch {
        /* ignore — the choice just won't survive a reload */
      }
      return next;
    });
  }, []);

  return [on, toggle];
};
