/**
 * The React half of `combatDefender.ts` (protocol v34 ↔ engine #494): which
 * defender substitution the board and the combat panel are currently showing.
 *
 * Unlike the swap/callout FX hooks next door this one is not primarily
 * timer-driven. A substitution is a standing fact about the live combat — "Newt
 * is the one taking this hit" — so it stays up for as long as the view agrees
 * with it (`defenderSwapStillLive`) and drops the instant the combat ends or the
 * defender becomes somebody else. A pure TTL would blink the highlight off
 * mid-combat and leave the attack arrow pointing at a figure nothing on screen
 * ever explained.
 *
 * The one timer is for the opposite case: a combat that SUBSTITUTES AND RESOLVES
 * in a single server drive arrives with `combat: null` already, so there is no
 * view left to agree with. That beat still has to be seen — it is the frame the
 * damage lands in — so it lingers briefly, the same way the combat panel itself
 * lingers through the strike beat.
 */
import { useEffect, useRef, useState } from "react";
import { GameEvent, PlayerView } from "./protocol";
import { DefenderSwap, defenderSwapStillLive, latestDefenderChange } from "./combatDefender";

/** How long a substitution whose combat is already over stays on screen (ms).
 *  Matches the combat callouts' own lifetime so the two beats end together. */
export const DEFENDER_SWAP_LINGER_MS = 2300;

export function useDefenderSwap(
  snapshot: { view: PlayerView; events: GameEvent[] } | null
): DefenderSwap | null {
  const [swap, setSwap] = useState<DefenderSwap | null>(null);
  const seqRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** key of a swap whose combat is already over and which is riding out its
   *  linger — the view can no longer confirm it, so the timer owns it alone. */
  const lingeringKeyRef = useRef<number | null>(null);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  useEffect(() => {
    if (!snapshot) return;
    const fresh = latestDefenderChange(snapshot.events);
    if (fresh) {
      const key = seqRef.current++;
      setSwap({ ...fresh, key });
      if (timerRef.current) clearTimeout(timerRef.current);
      // Still the live combat's defender ⇒ the view will retire it. Already over
      // ⇒ nothing will, so retire it here.
      if (defenderSwapStillLive(fresh, snapshot.view)) {
        timerRef.current = null;
        lingeringKeyRef.current = null;
      } else {
        lingeringKeyRef.current = key;
        timerRef.current = setTimeout(() => {
          lingeringKeyRef.current = null;
          setSwap((cur) => (cur?.key === key ? null : cur));
        }, DEFENDER_SWAP_LINGER_MS);
      }
      return;
    }
    // No substitution in this batch: keep the standing one only while the view
    // still says its fighter is defending — or while it is lingering, where the
    // timer is the only thing that can retire it.
    setSwap((cur) =>
      cur && (cur.key === lingeringKeyRef.current || defenderSwapStillLive(cur, snapshot.view))
        ? cur
        : null
    );
  }, [snapshot]);

  return swap;
}
