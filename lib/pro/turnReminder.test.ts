import {
  advanceTurnReminder,
  FIRST_NUDGE_MS,
  initialTurnReminderState,
  MAX_NUDGES,
  REPEAT_NUDGE_MS,
  TurnReminderSignals,
  TurnReminderState,
} from "./turnReminder";

const T0 = 1_700_000_000_000;

const sig = (over: Partial<TurnReminderSignals> = {}): TurnReminderSignals => ({
  owed: "turn",
  progressKey: "turn:3:2:ACTION_SELECT:",
  now: T0,
  ...over,
});

/** fold a script of observations, collecting every `due` tick it produced */
const run = (steps: Partial<TurnReminderSignals>[], from?: TurnReminderState) => {
  let state = from ?? initialTurnReminderState();
  const dueAt: number[] = [];
  for (const step of steps) {
    const signals = sig(step);
    const next = advanceTurnReminder(state, signals);
    state = next.state;
    if (next.due) dueAt.push(signals.now);
  }
  return { state, dueAt };
};

describe("advanceTurnReminder", () => {
  it("stays quiet before the first threshold", () => {
    const { dueAt } = run([
      { now: T0 },
      { now: T0 + FIRST_NUDGE_MS - 1 },
    ]);
    expect(dueAt).toEqual([]);
  });

  it("nudges once a fresh ask has waited the full first window", () => {
    const { dueAt } = run([
      { now: T0 },
      { now: T0 + FIRST_NUDGE_MS },
    ]);
    expect(dueAt).toEqual([T0 + FIRST_NUDGE_MS]);
  });

  it("does not re-fire the same nudge on a later identical check", () => {
    // a re-applied snapshot batch / a duplicate tick must be a no-op
    const { dueAt } = run([
      { now: T0 },
      { now: T0 + FIRST_NUDGE_MS },
      { now: T0 + FIRST_NUDGE_MS }, // same instant, same signals, again
      { now: T0 + FIRST_NUDGE_MS + 1 },
    ]);
    expect(dueAt).toEqual([T0 + FIRST_NUDGE_MS]);
  });

  it("repeats at the shorter interval, capped at MAX_NUDGES", () => {
    const nudge1 = T0 + FIRST_NUDGE_MS;
    const nudge2 = nudge1 + REPEAT_NUDGE_MS;
    const nudge3 = nudge2 + REPEAT_NUDGE_MS;
    const wouldBeNudge4 = nudge3 + REPEAT_NUDGE_MS;
    expect(MAX_NUDGES).toBe(3);

    const { dueAt, state } = run([
      { now: T0 },
      { now: nudge1 },
      { now: nudge2 },
      { now: nudge3 },
      { now: wouldBeNudge4 },
    ]);
    expect(dueAt).toEqual([nudge1, nudge2, nudge3]);
    expect(state.nudgesFired).toBe(MAX_NUDGES);
  });

  it("resets the clock when progress happens mid-wait, even for the same ask", () => {
    const { dueAt } = run([
      { now: T0, progressKey: "turn:3:2:ACTION_SELECT:" },
      // a card played, actions remaining ticks down — still my turn, but a
      // different ask: the old 60s clock must not carry over
      { now: T0 + 40_000, progressKey: "turn:3:1:ACTION_SELECT:" },
      { now: T0 + 40_000 + FIRST_NUDGE_MS - 1, progressKey: "turn:3:1:ACTION_SELECT:" },
    ]);
    expect(dueAt).toEqual([]);
  });

  it("resets when the reason changes from turn to defense", () => {
    const { dueAt } = run([
      { now: T0, owed: "turn", progressKey: "turn:1:3:ACTION_SELECT:" },
      { now: T0 + 50_000, owed: "defense", progressKey: "defense:f1:f2:p1" },
      { now: T0 + 50_000 + FIRST_NUDGE_MS - 1, owed: "defense", progressKey: "defense:f1:f2:p1" },
    ]);
    expect(dueAt).toEqual([]);
  });

  it("never nudges while nothing is owed (spectator, setup, game over, opponent's turn)", () => {
    const { dueAt } = run([
      { now: T0, owed: null, progressKey: "" },
      { now: T0 + 5 * FIRST_NUDGE_MS, owed: null, progressKey: "" },
    ]);
    expect(dueAt).toEqual([]);
  });

  it("starts a fresh clock once the turn comes back around", () => {
    const rearrivesAt = T0 + 5_000;
    const { dueAt } = run([
      { now: T0, owed: "turn", progressKey: "turn:1:3:ACTION_SELECT:" },
      { now: rearrivesAt, owed: null, progressKey: "" }, // turn passed to the opponent
      // the clock restarts from the tick that FIRST observes it owed again —
      // not from some earlier moment the module was never told about
      { now: rearrivesAt, owed: "turn", progressKey: "turn:3:3:ACTION_SELECT:" },
      { now: rearrivesAt + FIRST_NUDGE_MS - 1, owed: "turn", progressKey: "turn:3:3:ACTION_SELECT:" },
      { now: rearrivesAt + FIRST_NUDGE_MS, owed: "turn", progressKey: "turn:3:3:ACTION_SELECT:" },
    ]);
    expect(dueAt).toEqual([rearrivesAt + FIRST_NUDGE_MS]);
  });

  it("is quiet all the way through an untouched, always-owed match — regression for a clock that never advances", () => {
    const { dueAt } = run([
      { now: T0 },
      { now: T0 + 10_000 },
      { now: T0 + 20_000 },
      { now: T0 + 59_000 },
    ]);
    expect(dueAt).toEqual([]);
  });
});
