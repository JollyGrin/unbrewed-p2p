/**
 * Turn reminder — the decision half, as a pure reducer, in the same shape as
 * lobbyCue.ts. Real request from a player who plays matches alongside other
 * things and forgets it is their move: nudge them when this seat has owed a
 * turn, or a combat defense, for a while and nothing has happened.
 *
 * Two constraints shape the design:
 *
 * 1. Unlike lobbyCue.ts, nothing here is purely event-driven — a player who
 *    has simply stopped touching the app produces no new views at all, so the
 *    caller has to feed this module the WALL CLOCK (a ticking interval), not
 *    just view transitions, for the wait to ever be noticed.
 * 2. Views arrive as paced snapshot batches (useProSocket's drainApplyQueue),
 *    and an accepted undo rewinds through them — so this module never treats
 *    "the view changed" as an event on its own. It is fed a plain `owed`
 *    reason plus a `progressKey` describing the CURRENT ask, and it is the
 *    CLOCK (`now` crossing a threshold since the last check), not a change in
 *    either of those, that ever produces `due: true`. Calling this twice with
 *    identical signals — a re-applied snapshot, a duplicate tick — is always
 *    a no-op, so a replay can never double-fire a nudge.
 */

/** How long a fresh ask (a turn just handed over, a defense just asked for)
 *  waits before its first nudge. Long enough that reading the board or a hand
 *  never trips it — nobody decides a move in under a minute — short enough
 *  that a forgotten tab gets caught well before most rooms' own move-clock
 *  would forfeit it. */
export const FIRST_NUDGE_MS = 60_000;

/** How long between the first nudge and any repeat. Tighter than the first
 *  wait: once a nudge has already gone unanswered, a second one need not be
 *  as patient as the first. */
export const REPEAT_NUDGE_MS = 45_000;

/** Nudges fired for one ask before this module goes quiet on it (first nudge
 *  + two repeats). Past this, more buzzing stops being a reminder and starts
 *  being noise — the turn strip / DEFEND! chrome already carries the fact
 *  that it's still owed, for as long as it stays owed. */
export const MAX_NUDGES = 3;

/** What this seat can be found owing. The caller (useTurnReminder.ts) reads
 *  the view to decide this — a spectator, a game over, setup, or simply not
 *  this seat's turn all collapse to `null`, which this module treats as
 *  "nothing to time" rather than as a special case. */
export type TurnReminderReason = "turn" | "defense";

/** One observation fed in on every tick or view change. */
export interface TurnReminderSignals {
  /** what is currently owed, or null if nothing is */
  owed: TurnReminderReason | null;
  /** identifies the CURRENT ask well enough that any real change to it —
   *  an action taken (actionsRemaining ticking down), a prompt resolving, a
   *  combat stage advancing — produces a different value. Any change resets
   *  the wait, even while `owed` itself stays the same reason. */
  progressKey: string;
  /** epoch ms */
  now: number;
}

export interface TurnReminderState {
  owed: TurnReminderReason | null;
  progressKey: string | null;
  /** when the CURRENT ask started being owed */
  waitingSince: number | null;
  /** when the last nudge fired for this ask, or null before the first */
  lastNudgeAt: number | null;
  nudgesFired: number;
}

export const initialTurnReminderState = (): TurnReminderState => ({
  owed: null,
  progressKey: null,
  waitingSince: null,
  lastNudgeAt: null,
  nudgesFired: 0,
});

/**
 * Fold one observation into the reminder state. Returns the next state and
 * whether a nudge is due right now. Pure: same inputs, same outputs, no clock
 * of its own — the caller passes `now`.
 */
export function advanceTurnReminder(
  prev: TurnReminderState,
  signals: TurnReminderSignals,
): { state: TurnReminderState; due: boolean } {
  // Nothing owed — never while the player isn't the one being waited on. Reset
  // entirely so the NEXT ask (this seat's next turn, the next defense) starts
  // its own fresh clock rather than inheriting a stale nudge count.
  if (!signals.owed) {
    return { state: initialTurnReminderState(), due: false };
  }

  // A new ask: either the reason changed (turn <-> defense) or real progress
  // happened within the same reason (the prompt/actions/stage moved on).
  // Restart the wait — a player who just acted has earned a fresh FIRST_NUDGE_MS
  // of quiet, not the remainder of the old clock.
  const isNewAsk =
    prev.waitingSince === null ||
    signals.owed !== prev.owed ||
    signals.progressKey !== prev.progressKey;
  if (isNewAsk) {
    return {
      state: {
        owed: signals.owed,
        progressKey: signals.progressKey,
        waitingSince: signals.now,
        lastNudgeAt: null,
        nudgesFired: 0,
      },
      due: false,
    };
  }

  if (prev.nudgesFired >= MAX_NUDGES) {
    return { state: prev, due: false };
  }

  const threshold = prev.nudgesFired === 0 ? FIRST_NUDGE_MS : REPEAT_NUDGE_MS;
  const since = prev.nudgesFired === 0 ? prev.waitingSince! : prev.lastNudgeAt!;
  if (signals.now - since < threshold) {
    return { state: prev, due: false };
  }

  return {
    state: { ...prev, lastNudgeAt: signals.now, nudgesFired: prev.nudgesFired + 1 },
    due: true,
  };
}
