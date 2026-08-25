/**
 * Slow mode's pacing queue (#703). The interesting assertions here are all
 * SAFETY VALVES — every one of them is a way slow mode could otherwise strand a
 * player: a defense prompt held behind a spotlight, their own move queued behind
 * a bot's, a resume snapshot never applied, a backlog that grows all game.
 *
 * The invariant underneath all of them: snapshots apply in ARRIVAL ORDER. Every
 * test that flushes checks the order of what came out, not just how much.
 */
import {
  batchActor,
  emptySlowModeState,
  isPacedBatch,
  isSilentBatch,
  SLOW_MODE_QUEUE_CAP,
  slowModeStep,
  SlowModeBatch,
  SlowModeState,
  spotlightCards,
} from "./slowModeQueue";
import { GameEvent, PlayerView } from "./protocol";

const view = (over: Partial<PlayerView> = {}): PlayerView =>
  ({
    you: "p1",
    phase: "PLAY",
    turnNumber: 1,
    activePlayer: "p2",
    fighters: [],
    players: [],
    prompt: null,
    winner: null,
    ...over,
  } as unknown as PlayerView);

/** A test batch, tagged so an ordering assertion can name the ones it expects. */
interface Batch extends SlowModeBatch {
  tag: string;
}
const batch = (tag: string, events: GameEvent[], over: Partial<PlayerView> = {}): Batch => ({
  tag,
  events,
  view: view(over),
});

/** An ordinary opponent action: p2 spends a maneuver. */
const oppAction = (tag: string, over: Partial<PlayerView> = {}) =>
  batch(tag, [{ type: "ACTION_SPENT", player: "p2", action: "MANEUVER" }], over);

const tags = (batches: Batch[]) => batches.map((b) => b.tag);

/** Feed a run of events through the reducer, collecting everything applied. */
const run = (events: Parameters<typeof slowModeStep<Batch>>[1][]) => {
  let state: SlowModeState<Batch> = emptySlowModeState<Batch>();
  const applied: Batch[] = [];
  for (const e of events) {
    const step = slowModeStep(state, e);
    state = step.state;
    applied.push(...step.apply);
  }
  return { state, applied: tags(applied) };
};

const state = (b: Batch, slowMode = true, ctx: { ownAction?: boolean; resume?: boolean } = {}) =>
  ({ type: "STATE", batch: b, slowMode, ...ctx } as const);

describe("batchActor", () => {
  it("names the seat whose decision produced the batch", () => {
    expect(batchActor([{ type: "ACTION_SPENT", player: "p2", action: "SCHEME" }])).toBe("p2");
  });

  it("ignores events that merely NAME a player — an opponent's scheme can draw you a card", () => {
    expect(
      batchActor([
        { type: "CARD_DRAWN", player: "p1", card: "h/c#1" },
        { type: "DAMAGE_APPLIED", fighter: "p1/hero", amount: 2, source: "EFFECT" },
        { type: "ACTION_SPENT", player: "p2", action: "SCHEME" },
      ])
    ).toBe("p2");
  });

  it("credits the seat that ENDED the turn, not the one whose turn began", () => {
    expect(
      batchActor([
        { type: "TURN_ENDED", player: "p2" },
        { type: "TURN_STARTED", player: "p1", turnNumber: 4 },
      ])
    ).toBe("p2");
  });

  it("returns null when nothing in the batch names an actor", () => {
    expect(batchActor([{ type: "HERO_PLACED", fighter: "p1/hero", space: "s1" }])).toBeNull();
  });
});

describe("isPacedBatch — the safety valves", () => {
  it("paces an ordinary opponent action", () => {
    expect(isPacedBatch(oppAction("a"))).toBe(true);
  });

  it("never paces a (re)connection's own first view", () => {
    expect(isPacedBatch(batch("resume", []), { resume: true })).toBe(false);
  });

  it("DOES pace an events-less broadcast that is not a reconnection", () => {
    // The engine emits these mid-turn (`applyUndo` clears lastEvents and
    // rebroadcasts; a live bot turn shows others). Treating "no events" as "must
    // be a resume" let them flush the queue and yank a spotlight mid-read.
    expect(isPacedBatch(batch("rewind", []))).toBe(true);
    // …but there is nothing to narrate, so it never becomes a spotlight either.
    expect(isSilentBatch(batch("rewind", []))).toBe(true);
    expect(isSilentBatch(oppAction("a"))).toBe(false);
  });

  it("never paces a batch that opens a prompt for YOU — a defense prompt cannot wait", () => {
    const defense = batch(
      "defend",
      [{ type: "ATTACK_DECLARED", attacker: "p2/hero", target: "p1/hero" }],
      { prompt: { promptId: "x", player: "p1", kind: "COMMIT_COMBAT_CARD", options: [] } as PlayerView["prompt"] }
    );
    expect(isPacedBatch(defense)).toBe(false);
  });

  it("still paces a batch whose prompt belongs to somebody ELSE (2v2)", () => {
    const other = oppAction("their-prompt", {
      prompt: { promptId: "x", player: "p3", kind: "CHOOSE_TARGET", options: [] } as PlayerView["prompt"],
    });
    expect(isPacedBatch(other)).toBe(true);
  });

  it("never paces YOUR OWN action, by actor or by the in-flight latch", () => {
    expect(isPacedBatch(batch("mine", [{ type: "ACTION_SPENT", player: "p1", action: "ATTACK" }]))).toBe(false);
    // …and even when the batch names no actor at all, the latch settles it.
    expect(isPacedBatch(batch("mine", [{ type: "HERO_PLACED", fighter: "p1/hero", space: "s1" }]), { ownAction: true })).toBe(false);
  });

  it("never paces a decided game", () => {
    expect(isPacedBatch(oppAction("final", { winner: "p2" }))).toBe(false);
  });
});

describe("slowModeStep", () => {
  it("is a pass-through with slow mode OFF — nothing is ever held", () => {
    const { state: s, applied } = run([
      state(oppAction("a"), false),
      state(oppAction("b"), false),
    ]);
    expect(applied).toEqual(["a", "b"]);
    expect(s).toEqual({ queue: [], held: null });
  });

  it("applies one opponent action and then holds the rest", () => {
    const { state: s, applied } = run([
      state(oppAction("a")),
      state(oppAction("b")),
      state(oppAction("c")),
    ]);
    expect(applied).toEqual(["a"]);
    expect(s.held?.tag).toBe("a");
    expect(tags(s.queue)).toEqual(["b", "c"]);
  });

  it("advances one batch per OK, in arrival order, then stops holding", () => {
    let s = emptySlowModeState<Batch>();
    const applied: string[] = [];
    for (const e of [state(oppAction("a")), state(oppAction("b")), state(oppAction("c"))]) {
      const step = slowModeStep(s, e);
      s = step.state;
      applied.push(...tags(step.apply));
    }
    for (const _ of [0, 1, 2]) {
      const step = slowModeStep(s, { type: "ADVANCE" });
      s = step.state;
      applied.push(...tags(step.apply));
    }
    expect(applied).toEqual(["a", "b", "c"]);
    expect(s).toEqual({ queue: [], held: null });
  });

  it("flushes the whole queue BEFORE your own action lands", () => {
    const { state: s, applied } = run([
      state(oppAction("a")),
      state(oppAction("b")),
      state(oppAction("c")),
      state(batch("mine", [{ type: "ACTION_SPENT", player: "p1", action: "ATTACK" }])),
    ]);
    expect(applied).toEqual(["a", "b", "c", "mine"]);
    expect(s).toEqual({ queue: [], held: null });
  });

  it("flushes before a prompt aimed at you, so a defense decision is never delayed", () => {
    const defend = batch("defend", [{ type: "ATTACK_DECLARED", attacker: "p2/hero", target: "p1/hero" }], {
      prompt: { promptId: "x", player: "p1", kind: "COMMIT_COMBAT_CARD", options: [] } as PlayerView["prompt"],
    });
    const { state: s, applied } = run([state(oppAction("a")), state(oppAction("b")), state(defend)]);
    expect(applied).toEqual(["a", "b", "defend"]);
    expect(s.held).toBeNull();
  });

  it("bypasses the queue for a reconnection's own view", () => {
    const { applied } = run([
      state(oppAction("a")),
      state(oppAction("b")),
      state(batch("resume", []), true, { resume: true }),
    ]);
    expect(applied).toEqual(["a", "b", "resume"]);
  });

  it("flushes when the game ends, however deep the queue is", () => {
    const { state: s, applied } = run([
      state(oppAction("a")),
      state(oppAction("b")),
      state(oppAction("over", { winner: "p2" })),
    ]);
    expect(applied).toEqual(["a", "b", "over"]);
    expect(s).toEqual({ queue: [], held: null });
  });

  it("flushes in order when the toggle is switched off mid-queue", () => {
    let s = emptySlowModeState<Batch>();
    const applied: string[] = [];
    for (const e of [state(oppAction("a")), state(oppAction("b")), state(oppAction("c"))]) {
      const step = slowModeStep(s, e);
      s = step.state;
      applied.push(...tags(step.apply));
    }
    const off = slowModeStep(s, { type: "DISABLE" });
    expect(tags(off.apply)).toEqual(["b", "c"]);
    expect(off.state).toEqual({ queue: [], held: null });
    expect([...applied, ...tags(off.apply)]).toEqual(["a", "b", "c"]);
  });

  it("'Skip all' drains everything at once, in order", () => {
    let s = emptySlowModeState<Batch>();
    for (const e of [state(oppAction("a")), state(oppAction("b")), state(oppAction("c"))]) {
      s = slowModeStep(s, e).state;
    }
    const skip = slowModeStep(s, { type: "SKIP_ALL" });
    expect(tags(skip.apply)).toEqual(["b", "c"]);
    expect(skip.state).toEqual({ queue: [], held: null });
  });

  it("caps the backlog: the oldest batches past the cap apply un-spotlit, in order", () => {
    // 1 on screen + CAP queued is the ceiling; the next arrival pushes the oldest out.
    const arrivals = Array.from({ length: SLOW_MODE_QUEUE_CAP + 3 }, (_, i) =>
      state(oppAction(`b${i}`))
    );
    const { state: s, applied } = run(arrivals);
    // b0 was spotlit; b1/b2 fell off the front of the queue as b11/b12 arrived.
    expect(applied).toEqual(["b0", "b1", "b2"]);
    // …and b0 is STILL what is held. This is the regression: overflow used to
    // repaint the panel with each batch it flushed past, which is what "the
    // spotlight advances on its own" looked like from the player's seat.
    expect(s.held?.tag).toBe("b0");
    expect(s.queue).toHaveLength(SLOW_MODE_QUEUE_CAP);
    expect(tags(s.queue)[0]).toBe("b3");
    expect(tags(s.queue).at(-1)).toBe(`b${SLOW_MODE_QUEUE_CAP + 2}`);
  });

  it("interleaves several opponent seats (2v2) in strict arrival order", () => {
    const p3 = batch("p3-move", [{ type: "ACTION_SPENT", player: "p3", action: "MANEUVER" }]);
    const { state: s, applied } = run([state(oppAction("p2-move")), state(p3), state(oppAction("p2-again"))]);
    expect(applied).toEqual(["p2-move"]);
    expect(tags(s.queue)).toEqual(["p3-move", "p2-again"]);
  });

  it("pulls silent batches through on one OK instead of charging one each", () => {
    const silent = (tag: string) => batch(tag, []);
    let st = emptySlowModeState<Batch>();
    const applied: string[] = [];
    for (const e of [state(oppAction("a")), state(silent("s1")), state(silent("s2")), state(oppAction("b"))]) {
      const step = slowModeStep(st, e);
      st = step.state;
      applied.push(...tags(step.apply));
    }
    expect(applied).toEqual(["a"]);
    expect(st.held?.tag).toBe("a");

    const step = slowModeStep(st, { type: "ADVANCE" });
    // Order is still exact — the silent pair is applied, just not dwelt on.
    expect(tags(step.apply)).toEqual(["s1", "s2", "b"]);
    expect(step.state.held?.tag).toBe("b");
  });

  it("stops holding when only silent batches remain", () => {
    let st = emptySlowModeState<Batch>();
    for (const e of [state(oppAction("a")), state(batch("s1", []))]) st = slowModeStep(st, e).state;
    const step = slowModeStep(st, { type: "ADVANCE" });
    expect(tags(step.apply)).toEqual(["s1"]);
    expect(step.state.held).toBeNull();
  });

  it("applies a silent batch immediately when nothing is held", () => {
    const { state: st, applied } = run([state(batch("s1", []))]);
    expect(applied).toEqual(["s1"]);
    expect(st.held).toBeNull();
  });

  it("RESET drops everything without applying it (leaving the game)", () => {
    let s = emptySlowModeState<Batch>();
    for (const e of [state(oppAction("a")), state(oppAction("b"))]) s = slowModeStep(s, e).state;
    const reset = slowModeStep(s, { type: "RESET" });
    expect(reset.apply).toEqual([]);
    expect(reset.state).toEqual({ queue: [], held: null });
  });
});

describe("spotlightCards", () => {
  it("leads with the card the opponent PLAYED, not one their card moved", () => {
    expect(
      spotlightCards([
        { type: "CARD_DISCARDED", player: "p1", card: "h/dumped#1", reason: "EFFECT" },
        { type: "SCHEME_PLAYED", player: "p2", card: "h/scheme#3" },
      ])[0]
    ).toBe("h/scheme#3");
  });

  it("skips redacted ids so a face-down boost never renders as a blank", () => {
    expect(
      spotlightCards([
        { type: "CARD_BOOSTED", role: "ATTACK", card: "(hidden)", blind: true },
        { type: "CARD_REVEALED", player: "p2", card: "h/real#2" },
      ])
    ).toEqual(["h/real#2"]);
  });

  it("is empty for a card-less action (a plain maneuver)", () => {
    expect(spotlightCards([{ type: "ACTION_SPENT", player: "p2", action: "MANEUVER" }])).toEqual([]);
  });

  it("collects a whole combat — attack, defense and the boosts under them", () => {
    // The reason combat is no longer skipped: by the time the panel is read the
    // reveal has flown past, and these are the cards worth studying.
    expect(
      spotlightCards([
        { type: "ATTACK_DECLARED", attacker: "p2/hero", target: "p1/hero" },
        { type: "CARDS_REVEALED", attackerCard: "h/atk#1", defenderCard: "h/def#2" },
        { type: "CARD_BOOSTED", role: "ATTACK", card: "h/boost#3", blind: false },
        { type: "COMBAT_DAMAGE", amount: 3 },
      ])
    ).toEqual(["h/atk#1", "h/def#2", "h/boost#3"]);
  });

  it("de-duplicates, and takes cards the feed named that the events did not", () => {
    expect(
      spotlightCards(
        [{ type: "SCHEME_PLAYED", player: "p2", card: "h/scheme#3" }],
        ["h/scheme#3", "h/from-the-log#9", "(hidden)"]
      )
    ).toEqual(["h/scheme#3", "h/from-the-log#9"]);
  });
});
