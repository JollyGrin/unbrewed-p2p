/**
 * "The math beat" (issue #382, part of the #379 battle-sequence epic).
 *
 * Combat value modifiers used to surface only as activity-log prose while
 * `card.effectiveValue` mutated silently under the card. This module makes each
 * modifier a VISIBLE beat: a chip (`+2 boost`, `−1 effect`) flies onto the slot's
 * value pill and the pill ticks from the pre-modifier value up to the new effective
 * value. Chips queue through the presentation timeline (`battleTimeline.ts`) so
 * three modifiers in one STATE batch read as three beats, capped so the run stays
 * bounded.
 *
 * Two halves, mirroring combatFx/combatStrike:
 *  - `deriveValueBeats` — PURE. Diffs a snapshot's `events` (VALUE_MODIFIED /
 *    CARD_BOOSTED) into per-role chip lists, forward-simulating the pill's value at
 *    each step from a captured start value up to the final effective value. Empty
 *    events (join/reconnect, pre-v10) yield nothing — no ghost chips on rejoin.
 *  - `useCombatValueFx` — a thin hook that paces the chips through the timeline,
 *    steps the displayed value as each lands, and cleans up its timers.
 *
 * Everything the beat needs is CAPTURED AT DIFF TIME (deltas, the final effective
 * value read from the resolving view, or the frozen `prev.combat` when the combat
 * ends in the same batch) — never re-read from the live view mid-animation, per the
 * epic's shared constraint.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { CardDefId, CardInstanceId, CardMeta, GameEvent, PlayerView } from "./protocol";
import { BATTLE_MAX_LEAD_MS, scheduleBeats, useBattleTimeline } from "./battleTimeline";

export type CombatRole = "ATTACK" | "DEFENSE";

/** One value-modifier beat: a chip that flies onto the pill, plus the pill value it
 *  leaves behind. `source` names the boost card when the event carried one. */
export interface ValueChip {
  role: CombatRole;
  /** signed modifier applied (0 for a blind/decorative boost with no known value). */
  delta: number;
  /** short chip caption, e.g. "+2 boost" / "−1 effect" / "boost". */
  label: string;
  /** the boost card instance, for name resolution in the overlay (null otherwise). */
  source: CardInstanceId | null;
  /** the pill's displayed value AFTER this chip lands (forward-simulated). */
  toValue: number;
  /** how long this chip occupies the timeline before the next may start (ms). */
  duration: number;
}

/** Per-role beat plan: the ordered chips, the value the pill starts at (before the
 *  first chip), and the value it ends at (the view's effective value). */
export interface RoleValueBeats {
  chips: ValueChip[];
  startValue: number;
  finalValue: number;
}

export interface ValueBeats {
  ATTACK: RoleValueBeats | null;
  DEFENSE: RoleValueBeats | null;
}

/** Timeline occupancy of one chip (fly-in + a short hold) before the next starts. */
export const CHIP_DURATION_MS = 640;
/** How long a chip lingers on screen after it appears. */
const CHIP_TTL_MS = 900;
/** Count-up step cadence: the pill steps one unit at a time toward each chip's
 *  target so a +3 boost reads as a tick, not a jump. */
const COUNT_STEP_MS = 90;

const minus = "−"; // real minus sign, matching the board's floating "−N"
const signed = (n: number) => (n >= 0 ? `+${n}` : `${minus}${Math.abs(n)}`);
const cardDefOf = (instance: CardInstanceId): CardDefId => instance.split("#")[0];

/**
 * Diff a snapshot into per-role value-chip beats. Pure and event-derived. The final
 * value is read from the resolving view (`next.combat`) or, when the combat ended in
 * this same batch and `next.combat` is already null, from `prev.combat` — the same
 * frozen value the lingering panel renders. A batch with no value events yields
 * `{ ATTACK: null, DEFENSE: null }`.
 */
export function deriveValueBeats(
  prev: PlayerView | null,
  next: PlayerView,
  events: GameEvent[],
  catalog: Record<CardDefId, CardMeta>
): ValueBeats {
  if (!prev || events.length === 0) return { ATTACK: null, DEFENSE: null };

  // Effective value per role, from whichever combat view still carries the cards.
  const combat = next.combat ?? prev.combat ?? null;
  const finalValueOf = (role: CombatRole): number | null => {
    const card = role === "ATTACK" ? combat?.attackerCard : combat?.defenderCard;
    return card ? card.effectiveValue : null;
  };

  // Build chips in event order, pairing a CARD_BOOSTED with the next VALUE_MODIFIED
  // of the same role so a boost that also reports its value change reads as ONE
  // chip ("+2 boost"), never a doubled tick. A standalone boost whose value is
  // known (not blind) still ticks; a blind boost is a decorative delta-0 flourish.
  const raw: Record<CombatRole, ValueChip[]> = { ATTACK: [], DEFENSE: [] };
  const pendingBoost: Record<CombatRole, { card: CardInstanceId; value: number | null } | null> = {
    ATTACK: null,
    DEFENSE: null,
  };
  const flushBoost = (role: CombatRole) => {
    const b = pendingBoost[role];
    if (!b) return;
    pendingBoost[role] = null;
    const delta = b.value ?? 0;
    raw[role].push({
      role,
      delta,
      label: b.value != null ? `${signed(b.value)} boost` : "boost",
      source: b.card,
      toValue: 0, // filled by the forward-sim below
      duration: CHIP_DURATION_MS,
    });
  };

  for (const e of events) {
    if (e.type === "CARD_BOOSTED") {
      flushBoost(e.role); // a second boost before any value change: emit the first
      pendingBoost[e.role] = {
        card: e.card,
        value: e.blind ? null : catalog[cardDefOf(e.card)]?.boost ?? null,
      };
    } else if (e.type === "VALUE_MODIFIED") {
      const boost = pendingBoost[e.role];
      pendingBoost[e.role] = null;
      raw[e.role].push({
        role: e.role,
        delta: e.delta,
        label: boost ? `${signed(e.delta)} boost` : `${signed(e.delta)} effect`,
        source: boost?.card ?? null,
        toValue: 0,
        duration: CHIP_DURATION_MS,
      });
    }
  }
  flushBoost("ATTACK");
  flushBoost("DEFENSE");

  const build = (role: CombatRole): RoleValueBeats | null => {
    const chips = raw[role];
    if (chips.length === 0) return null;
    const finalValue = finalValueOf(role);
    if (finalValue == null) return null;
    // Anchor the start to the final so the pill lands EXACTLY on the view's value,
    // then forward-simulate each chip's target from there.
    const total = chips.reduce((sum, c) => sum + c.delta, 0);
    const startValue = finalValue - total;
    let running = startValue;
    for (const c of chips) {
      running += c.delta;
      c.toValue = running;
    }
    return { chips, startValue, finalValue };
  };

  return { ATTACK: build("ATTACK"), DEFENSE: build("DEFENSE") };
}

/** One live chip on screen: a derived `ValueChip` plus a stable key. */
export type LiveChip = ValueChip & { key: string };

/** Per-role live state the panel renders: the chips currently flying, and the pill's
 *  displayed value (null → show the raw view value, i.e. no beat in progress). */
export interface SlotValueFx {
  chips: LiveChip[];
  displayValue: number | null;
}

export interface CombatValueFx {
  ATTACK: SlotValueFx;
  DEFENSE: SlotValueFx;
}

const EMPTY_SLOT: SlotValueFx = { chips: [], displayValue: null };

/**
 * Pace the value chips through the presentation timeline. Each new batch cancels the
 * previous run (a fresh combat wipes stale chips), sets each affected pill to its
 * start value, then deals the chips out one at a time — appending the chip and
 * stepping the pill toward the chip's target as it lands. When the run finishes the
 * displayed value is released back to null so the pill reads the (now-final) view
 * value. All timers are owned by the shared timeline hook, so they clear on unmount.
 */
export function useCombatValueFx(
  snapshot: { view: PlayerView; events: GameEvent[] } | null
): CombatValueFx {
  const [attack, setAttack] = useState<SlotValueFx>(EMPTY_SLOT);
  const [defense, setDefense] = useState<SlotValueFx>(EMPTY_SLOT);
  const prevViewRef = useRef<PlayerView | null>(null);
  const seqRef = useRef(0);
  const { run, cancel } = useBattleTimeline();
  // Count-up interval per role (stepping the pill one unit at a time). Cleared when
  // a new tick starts for that role or when a new combat cancels everything.
  const countTimersRef = useRef<ReturnType<typeof setInterval>[]>([]);

  const setFor = useCallback((role: CombatRole, fn: (s: SlotValueFx) => SlotValueFx) => {
    (role === "ATTACK" ? setAttack : setDefense)(fn);
  }, []);

  const clearCounts = useCallback(() => {
    countTimersRef.current.forEach(clearInterval);
    countTimersRef.current = [];
  }, []);

  useEffect(() => () => clearCounts(), [clearCounts]);

  // Step a pill's displayed value one unit at a time toward `target`.
  const countTo = useCallback(
    (role: CombatRole, target: number) => {
      const timer = setInterval(() => {
        let done = false;
        setFor(role, (s) => {
          const cur = s.displayValue ?? target;
          if (cur === target) {
            done = true;
            return s;
          }
          const nextVal = cur + Math.sign(target - cur);
          if (nextVal === target) done = true;
          return { ...s, displayValue: nextVal };
        });
        if (done) clearInterval(timer);
      }, COUNT_STEP_MS);
      countTimersRef.current.push(timer);
    },
    [setFor]
  );

  useEffect(() => {
    if (!snapshot) return;
    const prev = prevViewRef.current;
    prevViewRef.current = snapshot.view;
    const beats = deriveValueBeats(prev, snapshot.view, snapshot.events, snapshot.view.catalog);
    if (!beats.ATTACK && !beats.DEFENSE) return;

    // A new batch of beats supersedes any in-flight run.
    cancel();
    clearCounts();

    const runRole = (role: CombatRole, plan: RoleValueBeats | null) => {
      if (!plan) return;
      // Show the pre-modifier value immediately; the chips will tick it up.
      setFor(role, () => ({ chips: [], displayValue: plan.startValue }));
      const scheduled = scheduleBeats(plan.chips, { maxLeadMs: BATTLE_MAX_LEAD_MS });
      run(scheduled.scheduled, (chip) => {
        const key = `chip-${seqRef.current++}`;
        setFor(role, (s) => ({ ...s, chips: [...s.chips, { ...chip, key }] }));
        countTo(role, chip.toValue);
        // Remove the chip after its lifetime (tracked timer → cleared on cancel/unmount).
        run([{ item: key, delay: CHIP_TTL_MS }], (k) =>
          setFor(role, (s) => ({ ...s, chips: s.chips.filter((c) => c.key !== k) }))
        );
      });
      // Release the pill back to the view value once the whole run has played out.
      run([{ item: null, delay: scheduled.endMs + CHIP_TTL_MS }], () =>
        setFor(role, (s) => ({ ...s, displayValue: null }))
      );
    };

    runRole("ATTACK", beats.ATTACK);
    runRole("DEFENSE", beats.DEFENSE);
  }, [snapshot, cancel, clearCounts, setFor, run, countTo]);

  return { ATTACK: attack, DEFENSE: defense };
}
