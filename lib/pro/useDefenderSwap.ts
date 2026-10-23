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
 *
 * `useCombatTargeting` at the bottom is the #694 companion: the standing "who was
 * declared against" fold, which catches the family this event never describes (a
 * bonus attack that OPENS somewhere else — Grievous's Multi-Arm Barrage).
 */
import { useEffect, useRef, useState } from "react";
import { GameEvent, PlayerView } from "./protocol";
import {
  AttackerChange,
  AttackerSwap,
  CombatTargeting,
  DefenderChange,
  DefenderSwap,
  EMPTY_COMBAT_TARGETING,
  advanceCombatTargeting,
  attackerSwapStillLive,
  latestAttackerChange,
  defenderSwapStillLive,
  latestDefenderChange,
} from "./combatDefender";

/** How long a substitution whose combat is already over stays on screen (ms).
 *  Matches the combat callouts' own lifetime so the two beats end together. */
export const DEFENDER_SWAP_LINGER_MS = 2300;

export function useDefenderSwap(
  snapshot: { view: PlayerView; events: GameEvent[] } | null
): DefenderSwap | null {
  return useCombatSwap<DefenderChange>(snapshot, latestDefenderChange, defenderSwapStillLive);
}

/** The attacker-side sibling (protocol v36 ↔ engine #752): same standing-chip
 *  rule, retired the moment `combat.attacker` no longer agrees. */
export function useAttackerSwap(
  snapshot: { view: PlayerView; events: GameEvent[] } | null
): AttackerSwap | null {
  return useCombatSwap<AttackerChange>(snapshot, latestAttackerChange, attackerSwapStillLive);
}

function useCombatSwap<C extends { from: string; to: string }>(
  snapshot: { view: PlayerView; events: GameEvent[] } | null,
  latest: (events: GameEvent[]) => C | null,
  stillLive: (swap: C, view: PlayerView) => boolean
): (C & { key: number }) | null {
  const [swap, setSwap] = useState<(C & { key: number }) | null>(null);
  const seqRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** key of a swap whose combat is already over and which is riding out its
   *  linger — the view can no longer confirm it, so the timer owns it alone. */
  const lingeringKeyRef = useRef<number | null>(null);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  useEffect(() => {
    if (!snapshot) return;
    const fresh = latest(snapshot.events);
    if (fresh) {
      const key = seqRef.current++;
      setSwap({ ...fresh, key });
      if (timerRef.current) clearTimeout(timerRef.current);
      // Still the live combat's fighter ⇒ the view will retire it. Already over
      // (or, for a post-damage defender takeover, the combat ended) ⇒ nothing
      // will, so retire it here.
      if (stillLive(fresh, snapshot.view)) {
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
    // still says its fighter is in the slot — or while it is lingering, where the
    // timer is the only thing that can retire it.
    setSwap((cur) =>
      cur && (cur.key === lingeringKeyRef.current || stillLive(cur, snapshot.view)) ? cur : null
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot]);

  return swap;
}

/**
 * The standing DECLARED-target tracker (issue #694). Sibling of the hook above and
 * deliberately much simpler: no timer, no key, no linger — it holds one fold of the
 * event stream (`advanceCombatTargeting`) across batches and hands it back, so the
 * page can ask `defenderRedirect` of whichever combat it is rendering.
 *
 * A ref rather than state for the running value, because the fold is the thing that
 * must survive a batch that renders nothing; the state copy is what re-renders.
 */
export function useCombatTargeting(
  snapshot: { view: PlayerView; events: GameEvent[] } | null
): CombatTargeting {
  const runningRef = useRef<CombatTargeting>(EMPTY_COMBAT_TARGETING);
  const [targeting, setTargeting] = useState<CombatTargeting>(EMPTY_COMBAT_TARGETING);

  useEffect(() => {
    if (!snapshot) return;
    const next = advanceCombatTargeting(runningRef.current, snapshot.events);
    runningRef.current = next;
    setTargeting((cur) =>
      cur.declared === next.declared && cur.attacker === next.attacker ? cur : next
    );
  }, [snapshot]);

  return targeting;
}
