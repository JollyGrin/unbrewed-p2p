/**
 * "The presentation timeline" (issue #382, part of the #379 battle-sequence epic).
 *
 * The engine emits every event for one action in a single STATE batch, so a combat
 * that boosts, resolves and ends all arrives at once. The battle sequence has to
 * PACE those beats client-side — a chip per modifier, one after another — instead
 * of flashing them together. This module generalizes the reveal-stagger machinery
 * (`combatFx.ts` REVEAL_STAGGER_MS / REVEAL_MAX_LEAD_MS / the useCombatCallouts
 * queue) into a tiny, framework-free scheduler:
 *
 *  - `scheduleBeats` — a PURE function: given a batch of already-captured beats each
 *    carrying a `duration`, assign each a `delay` (ms from now), laid out
 *    sequentially, and DROP the tail once the lead would run past a cap (so a combat
 *    with a dozen modifiers still reads in bounded time rather than drifting behind
 *    the board). Unit-testable with no React.
 *  - `useBattleTimeline` — a thin hook that owns the setTimeout bookkeeping: fire
 *    each scheduled beat at its delay, clear every timer on unmount, and expose a
 *    `cancel()` so a NEW combat starting mid-sequence wipes the pending beats of the
 *    old one (the epic's "cancelled when a new combat starts" constraint).
 *
 * Scope is deliberately tight to this issue's beats (value chips, the arc's own
 * board-FX delay is scheduled separately in useGameFx). Migrating the reveal queue
 * onto this scheduler is an optional follow-up, not part of #382.
 */
import { useCallback, useEffect, useRef } from "react";

/** The one field the scheduler needs off each beat: how long it occupies the
 *  timeline before the next beat may start (ms). Everything else on the item is
 *  opaque to the scheduler and passed straight through. */
export interface TimelineBeat {
  duration: number;
}

/** A beat with its assigned entrance time (ms from "now"). */
export interface ScheduledBeat<T> {
  item: T;
  delay: number;
}

export interface ScheduleOptions {
  /** The earliest the first beat may appear (ms from now). Default 0. */
  startMs?: number;
  /** Cap on the entrance lead: a beat whose `delay` would exceed this is dropped,
   *  and — since delays only grow — so is every beat after it. Mirrors
   *  combatFx.ts's REVEAL_MAX_LEAD_MS. */
  maxLeadMs: number;
}

export interface ScheduleResult<T> {
  scheduled: ScheduledBeat<T>[];
  /** How many trailing beats were dropped by the cap (0 when everything fit). */
  dropped: number;
  /** When the last kept beat finishes (ms from now); `startMs` when nothing fit. */
  endMs: number;
}

/** The battle sequence's entrance-lead cap. Keeps the total chip run ≲2.5s so a
 *  multi-modifier combat still lands its comparison beat without drifting behind
 *  the board (acceptance: "capped so total lead stays ≲2.5s"). Re-checked against
 *  the slowed sequence (#382 pacing): the chips (pre-combat modifiers) still wrap up
 *  before the arc lands (~2.5s) and well inside the longer linger, so 2.5s holds. */
export const BATTLE_MAX_LEAD_MS = 2500;

/**
 * Lay a batch of beats out sequentially, each starting when the previous one ends,
 * dropping the tail once the entrance lead passes `maxLeadMs`. Pure — no clock, no
 * React; the caller supplies durations and reads back delays.
 */
export function scheduleBeats<T extends TimelineBeat>(
  items: T[],
  opts: ScheduleOptions
): ScheduleResult<T> {
  const startMs = opts.startMs ?? 0;
  const scheduled: ScheduledBeat<T>[] = [];
  let cursor = startMs;
  let dropped = 0;
  for (const item of items) {
    // A beat whose entrance already ran past the cap is dropped; because `cursor`
    // only ever grows, every later beat is dropped too (the tail is truncated).
    if (cursor > opts.maxLeadMs) {
      dropped++;
      continue;
    }
    scheduled.push({ item, delay: cursor });
    cursor += Math.max(0, item.duration);
  }
  return {
    scheduled,
    dropped,
    endMs: scheduled.length ? cursor : startMs,
  };
}

/**
 * Thin timer runner for scheduled beats. `run` fires each beat's callback at its
 * `delay`; `cancel` clears all pending timers (call it when a new combat starts).
 * Every timer is cleared on unmount, so an animation in flight when the page tears
 * down leaves nothing orphaned.
 */
export function useBattleTimeline() {
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const cancel = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  useEffect(() => cancel, [cancel]);

  const run = useCallback(
    <T,>(scheduled: ScheduledBeat<T>[], fire: (item: T) => void) => {
      for (const beat of scheduled) {
        timersRef.current.push(setTimeout(() => fire(beat.item), beat.delay));
      }
    },
    []
  );

  return { run, cancel };
}
