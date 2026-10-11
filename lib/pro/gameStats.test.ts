/**
 * "How it went" (p2p #1398): the two routes to the same numbers — the live
 * event reducer and the replay-expansion read — plus the per-seat read-out,
 * the first-player fallbacks and the client clock.
 */
import type { GameEvent, PlayerView, ReplayBundle, ReplayExpansion, ReplayStep, ViewFighter } from "./protocol";
import {
  EMPTY_GAME_STATS,
  EMPTY_GAME_STATS_ACCUMULATOR,
  firstActorOf,
  formatClock,
  readOrMarkClockStart,
  reduceGameStats,
  sideSummary,
  statsFromExpansion,
} from "./gameStats";

const fighter = (id: string, owner: "p1" | "p2", hp: number, over: Partial<ViewFighter> = {}): ViewFighter =>
  ({ id, owner, kind: "HERO", name: id, space: "a1", tailSpace: null, hp, maxHp: 16, reach: "MELEE", size: "NORMAL", defeated: hp <= 0, ...over }) as ViewFighter;

const view = (turnNumber: number, fighters: ViewFighter[]): Pick<PlayerView, "fighters" | "turnNumber"> => ({ turnNumber, fighters });

const dmg = (fighterId: string, amount: number, source: "ATTACK" | "EFFECT" | "EXHAUSTION" = "ATTACK"): GameEvent => ({
  type: "DAMAGE_APPLIED",
  fighter: fighterId,
  amount,
  source,
});
const turnStarted = (player: "p1" | "p2", turnNumber: number): GameEvent => ({ type: "TURN_STARTED", player, turnNumber });

describe("reduceGameStats (live events)", () => {
  it("sums hp lost per owner per turn, tracks the biggest hit and first blood, and notes who took turn 1", () => {
    // Join STATE: no events, just the roster.
    let acc = reduceGameStats(EMPTY_GAME_STATS_ACCUMULATOR, [], view(0, [fighter("p1/hero", "p1", 16), fighter("p2/hero", "p2", 15), fighter("p2/side", "p2", 6)]));
    expect(acc.observed).toBe(false);
    expect(acc.hp["p2/hero"]).toBe(15);

    // Setup ends; p2 takes turn 1 and lands 3 on p1's hero.
    acc = reduceGameStats(acc, [turnStarted("p2", 1), dmg("p1/hero", 3)], view(1, [fighter("p1/hero", "p1", 13), fighter("p2/hero", "p2", 15), fighter("p2/side", "p2", 6)]));
    expect(acc.observed).toBe(true);
    expect(acc.stats.firstPlayer).toBe("p2");
    expect(acc.stats.firstBlood).toEqual({ victim: "p1", turn: 1 });

    // Turn 2: p1 hits the sidekick for 4 and the hero for 2 in one action.
    acc = reduceGameStats(acc, [turnStarted("p1", 2), dmg("p2/side", 4), dmg("p2/hero", 2, "EFFECT")], view(2, [fighter("p1/hero", "p1", 13), fighter("p2/hero", "p2", 13), fighter("p2/side", "p2", 2)]));
    // Turn 3 starts in one batch; a later mid-turn action (no TURN_STARTED of its own) hits back for 5.
    acc = reduceGameStats(acc, [turnStarted("p2", 3)], view(3, [fighter("p1/hero", "p1", 13), fighter("p2/hero", "p2", 13), fighter("p2/side", "p2", 2)]));
    acc = reduceGameStats(acc, [dmg("p1/hero", 5)], view(3, [fighter("p1/hero", "p1", 8), fighter("p2/hero", "p2", 13), fighter("p2/side", "p2", 2)]));

    expect(acc.stats.turns).toEqual([{ p1: 3 }, { p2: 6 }, { p1: 5 }]);
    expect(acc.stats.biggestHitOn).toEqual({ p1: { amount: 5, turn: 3 }, p2: { amount: 4, turn: 2 } });
    expect(acc.stats.firstBlood).toEqual({ victim: "p1", turn: 1 });
  });

  it("damage BEFORE the batch's TURN_STARTED lands on the previous turn", () => {
    let acc = reduceGameStats(EMPTY_GAME_STATS_ACCUMULATOR, [turnStarted("p1", 1)], view(1, [fighter("p1/hero", "p1", 16), fighter("p2/hero", "p2", 15)]));
    // End of turn 1: a lingering effect ticks 1 on p2, then turn 2 starts and exhaustion hits p2 for 2.
    acc = reduceGameStats(acc, [dmg("p2/hero", 1, "EFFECT"), turnStarted("p2", 2), dmg("p2/hero", 2, "EXHAUSTION")], view(2, [fighter("p1/hero", "p1", 16), fighter("p2/hero", "p2", 12)]));
    expect(acc.stats.turns).toEqual([{ p2: 1 }, { p2: 2 }]);
  });

  it("clamps a raw amount to the hp the fighter actually had — overkill is not damage dealt", () => {
    let acc = reduceGameStats(EMPTY_GAME_STATS_ACCUMULATOR, [turnStarted("p1", 1)], view(1, [fighter("p1/hero", "p1", 16), fighter("p2/side", "p2", 2)]));
    acc = reduceGameStats(acc, [dmg("p2/side", 6), { type: "FIGHTER_DEFEATED", fighter: "p2/side" }], view(1, [fighter("p1/hero", "p1", 16), fighter("p2/side", "p2", 0)]));
    expect(acc.stats.turns).toEqual([{ p2: 2 }]);
    expect(acc.stats.biggestHitOn.p2).toEqual({ amount: 2, turn: 1 });
    // A second hit on the already-downed fighter in the same batch adds nothing.
    acc = reduceGameStats(acc, [dmg("p2/side", 3)], view(1, [fighter("p1/hero", "p1", 16), fighter("p2/side", "p2", 0)]));
    expect(acc.stats.turns).toEqual([{ p2: 2 }]);
  });

  it("after a reload the first folded STATE has no events: nothing observed, hp tracked, and later damage lands on the view's turn", () => {
    let acc = reduceGameStats(EMPTY_GAME_STATS_ACCUMULATOR, [], view(7, [fighter("p1/hero", "p1", 9), fighter("p2/hero", "p2", 4)]));
    expect(acc.observed).toBe(false);
    expect(acc.stats).toEqual(EMPTY_GAME_STATS);
    acc = reduceGameStats(acc, [dmg("p2/hero", 2)], view(7, [fighter("p1/hero", "p1", 9), fighter("p2/hero", "p2", 2)]));
    expect(acc.observed).toBe(true);
    expect(acc.stats.turns[6]).toEqual({ p2: 2 });
    expect(acc.stats.turns.slice(0, 6)).toEqual([{}, {}, {}, {}, {}, {}]);
    expect(acc.stats.firstPlayer).toBeNull();
  });

  it("is pure: the input accumulator is not mutated", () => {
    const start = reduceGameStats(EMPTY_GAME_STATS_ACCUMULATOR, [turnStarted("p1", 1)], view(1, [fighter("p1/hero", "p1", 16), fighter("p2/hero", "p2", 15)]));
    const frozen = JSON.stringify(start);
    reduceGameStats(start, [dmg("p2/hero", 4)], view(1, [fighter("p1/hero", "p1", 16), fighter("p2/hero", "p2", 11)]));
    expect(JSON.stringify(start)).toBe(frozen);
    expect(JSON.stringify(EMPTY_GAME_STATS_ACCUMULATOR)).toBe(JSON.stringify({ stats: EMPTY_GAME_STATS, observed: false, turn: 0, hp: {}, owners: {} }));
  });
});

// A fixture expansion: four steps over three turns. p2 moves first; p1 bleeds
// first (3 on turn 1), p1 lands the biggest hit (5 on turn 2, sidekick down),
// and the final step heals p1 by 1, which must not count as anything.
const step = (index: number, turnNumber: number, activePlayer: "p1" | "p2", fighters: ViewFighter[]): ReplayStep =>
  ({ index, phase: "PLAY", turnNumber, activePlayer, fighters, winner: null }) as unknown as ReplayStep;

const FIXTURE_STEPS: ReplayStep[] = [
  step(0, 0, "p2", [fighter("p1/hero", "p1", 16), fighter("p2/hero", "p2", 15), fighter("p2/side", "p2", 5)]),
  step(1, 1, "p2", [fighter("p1/hero", "p1", 13), fighter("p2/hero", "p2", 15), fighter("p2/side", "p2", 5)]),
  step(2, 2, "p1", [fighter("p1/hero", "p1", 13), fighter("p2/hero", "p2", 13), fighter("p2/side", "p2", 0)]),
  step(3, 3, "p2", [fighter("p1/hero", "p1", 14), fighter("p2/hero", "p2", 13), fighter("p2/side", "p2", 0)]),
];

const expansion = (over: Partial<ReplayExpansion> = {}): ReplayExpansion =>
  ({ ok: true, steps: FIXTURE_STEPS, finalHash: "x", ...over }) as unknown as ReplayExpansion;

describe("statsFromExpansion (replay steps)", () => {
  it("reads hp drops per step as hits on the owner, on the step's turn; healing is ignored; first player is steps[0].activePlayer", () => {
    const stats = statsFromExpansion(expansion());
    expect(stats).toEqual({
      turns: [{ p1: 3 }, { p2: 7 }],
      biggestHitOn: { p1: { amount: 3, turn: 1 }, p2: { amount: 5, turn: 2 } },
      firstBlood: { victim: "p1", turn: 1 },
      firstPlayer: "p2",
    });
  });

  it("agrees with the reducer fed the matching events", () => {
    const f = (hero1: number, hero2: number, side2: number) => [fighter("p1/hero", "p1", hero1), fighter("p2/hero", "p2", hero2), fighter("p2/side", "p2", side2)];
    let acc = reduceGameStats(EMPTY_GAME_STATS_ACCUMULATOR, [], view(0, f(16, 15, 5)));
    acc = reduceGameStats(acc, [turnStarted("p2", 1), dmg("p1/hero", 3)], view(1, f(13, 15, 5)));
    acc = reduceGameStats(acc, [turnStarted("p1", 2), dmg("p2/hero", 2), dmg("p2/side", 9)], view(2, f(13, 13, 0)));
    acc = reduceGameStats(acc, [turnStarted("p2", 3)], view(3, f(14, 13, 0)));
    expect(acc.stats).toEqual(statsFromExpansion(expansion()));
  });

  it("refuses a diverged or empty expansion so the caller keeps its live numbers", () => {
    expect(statsFromExpansion(expansion({ verification: "diverged", divergedAtTurn: 2 }))).toBeNull();
    expect(statsFromExpansion(expansion({ steps: [] }))).toBeNull();
    expect(statsFromExpansion(expansion({ verification: "digest-verified" }))).not.toBeNull();
  });
});

describe("sideSummary", () => {
  const stats = statsFromExpansion(expansion())!;

  it("reads the stats as p1: dealt / taken / biggest hit landed / first blood by the opponent, padded to the game's turn count", () => {
    const s = sideSummary(stats, "p1", ["p1", "p2"], 4);
    expect(s.dealt).toBe(7);
    expect(s.taken).toBe(3);
    expect(s.biggestHit).toEqual({ amount: 5, turn: 2 });
    expect(s.firstBlood).toEqual({ dealtBy: "p2", turn: 1 });
    expect(s.perTurn).toEqual([
      { turn: 1, dealt: 0, taken: 3 },
      { turn: 2, dealt: 7, taken: 0 },
      { turn: 3, dealt: 0, taken: 0 },
      { turn: 4, dealt: 0, taken: 0 },
    ]);
  });

  it("…and as p2, who drew first blood", () => {
    const s = sideSummary(stats, "p2", ["p1", "p2"]);
    expect(s.dealt).toBe(3);
    expect(s.taken).toBe(7);
    expect(s.biggestHit).toEqual({ amount: 3, turn: 1 });
    expect(s.firstBlood).toEqual({ dealtBy: "p2", turn: 1 });
    expect(s.perTurn).toHaveLength(2);
  });

  it("empty stats: zeros, no hit, no first blood", () => {
    const s = sideSummary(EMPTY_GAME_STATS, "p1", ["p1", "p2"], 2);
    expect(s).toEqual({ dealt: 0, taken: 0, biggestHit: null, firstBlood: null, perTurn: [{ turn: 1, dealt: 0, taken: 0 }, { turn: 2, dealt: 0, taken: 0 }] });
  });

  it("in a lobby of more than two seats the dealer of first blood is unknown", () => {
    expect(sideSummary(stats, "p1", ["p1", "p2", "p3"]).firstBlood).toEqual({ dealtBy: null, turn: 1 });
  });
});

describe("firstActorOf", () => {
  it("is the seat on the first logged action, null without a bundle or log", () => {
    const bundle = { actionLog: [{ type: "RESPOND_PROMPT", player: "p2", promptId: "p0", optionId: "x" }, { type: "MANEUVER", player: "p1" }] } as unknown as ReplayBundle;
    expect(firstActorOf(bundle)).toBe("p2");
    expect(firstActorOf({ actionLog: [] } as unknown as ReplayBundle)).toBeNull();
    expect(firstActorOf(null)).toBeNull();
  });
});

describe("the client clock", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("stamps the first STATE's time once per room and hands the same stamp back after a reload", () => {
    expect(readOrMarkClockStart("room-a", 1_000)).toBe(1_000);
    expect(readOrMarkClockStart("room-a", 5_000)).toBe(1_000);
    expect(readOrMarkClockStart("room-b", 5_000)).toBe(5_000);
    expect(window.sessionStorage.getItem("pro:clock-start:room-a")).toBe("1000");
  });

  it("formats mm:ss, never negative, minutes past the hour", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(61_500)).toBe("01:01");
    expect(formatClock(4_504_000)).toBe("75:04");
    expect(formatClock(-30_000)).toBe("00:00");
    expect(formatClock(NaN)).toBe("00:00");
  });
});
