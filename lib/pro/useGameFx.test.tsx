/**
 * The revive batch's ORDER at the table (issue #1532): the hit that emptied William's
 * old dial lands first, the "REVIVED" callout trails it, and a same-window K.O. comes
 * last — instead of all three on top of each other (or the revive with no hit at all).
 */
import { act, renderHook } from "@testing-library/react";
import { GameFxRefs, useGameFx } from "./useGameFx";
import { sfx } from "./sfx";
import { ARC_FLIGHT_MS, ARC_LAUNCH_MS } from "./combatTiming";
import { GameEvent, PlayerView, ViewCombat, ViewFighter } from "./protocol";

jest.mock("./sfx", () => ({ sfx: { init: jest.fn(), play: jest.fn() } }));

const fighter = (over: Partial<ViewFighter>): ViewFighter => ({
  id: "p1/hero",
  owner: "p1",
  kind: "HERO",
  name: "King Kong",
  space: "s1",
  tailSpace: null,
  hp: 10,
  maxHp: 10,
  reach: "MELEE",
  size: "NORMAL",
  defeated: false,
  ...over,
});

const combat = (over: Partial<ViewCombat>): ViewCombat => ({
  attackerPlayer: "p2",
  defenderPlayer: "p1",
  attacker: "p2/hero",
  target: "p1/hero",
  stage: "COMMIT_ATTACK",
  attackerCard: null,
  defenderCard: null,
  additionalDefenseCard: null,
  outcome: null,
  attackDamageDealt: null,
  ...over,
});

const view = (over: Partial<PlayerView>): PlayerView => ({
  you: "p1",
  phase: "PLAY",
  turnNumber: 1,
  activePlayer: "p1",
  actionsRemaining: 2,
  turnPhase: "ACTION_SELECT",
  maneuver: null,
  map: { schemaVersion: "1", id: "m", meta: { title: "m", minPlayers: 2, maxPlayers: 2, specialRules: false }, zones: [], spaces: [] },
  catalog: {},
  fighters: [fighter({}), fighter({ id: "p2/hero", owner: "p2", name: "Baba Yaga", space: "s2" })],
  tokens: [],
  self: { id: "p1", heroId: "king-kong", hand: [], deckCount: 10, discard: [], committedCard: null, counters: {}, flags: {}, wonCombatThisTurn: false, lostCombatThisTurn: false, firstAttackThisTurn: false, playedACardThisTurn: false, tookDamageThisTurn: false },
  opponent: { id: "p2", heroId: "baba-yaga", handCount: 5, deckCount: 10, discard: [], hasCommitted: false, counters: {}, flags: {}, wonCombatThisTurn: false, lostCombatThisTurn: false, firstAttackThisTurn: false, playedACardThisTurn: false, tookDamageThisTurn: false },
  players: [
    { id: "p1", heroId: "fixture-p1", you: true, hand: [], handCount: 0, deckCount: 10, discard: [], committedCard: null, hasCommitted: false, counters: {}, flags: {}, wonCombatThisTurn: false, lostCombatThisTurn: false, firstAttackThisTurn: false, playedACardThisTurn: false, tookDamageThisTurn: false },
    { id: "p2", heroId: "fixture-p2", you: false, handCount: 5, deckCount: 10, discard: [], hasCommitted: false, counters: {}, flags: {}, wonCombatThisTurn: false, lostCombatThisTurn: false, firstAttackThisTurn: false, playedACardThisTurn: false, tookDamageThisTurn: false },
  ],
  combat: null,
  prompt: null,
  winner: null,
  ...over,
});

const william = fighter({ name: "William Afton", hp: 2, maxHp: 7 });
const opp = fighter({ id: "p2/hero", owner: "p2", name: "Baba Yaga", space: "s2" });

const played = () => (sfx.play as jest.Mock).mock.calls.map((c) => c[0]);

const STEP = 400;
const springtrap = { ...william, name: "Springtrap", hp: 12, maxHp: 12 };
const springtrapDown = { ...william, name: "Springtrap", hp: 0, maxHp: 12, space: null, defeated: true };

/** An element the arc can measure (jsdom rects are all zero, which skips the arc). */
const measurable = () => {
  const el = document.createElement("div");
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 10, height: 10, right: 10, bottom: 10, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  return el;
};

describe("useGameFx — a revive batch", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    (sfx.play as jest.Mock).mockClear();
  });
  afterEach(() => jest.useRealTimers());

  const run = (
    next: Partial<PlayerView>,
    { prev = {}, events, refs, pace }: { prev?: Partial<PlayerView>; events?: GameEvent[]; refs?: GameFxRefs; pace?: number } = {}
  ) => {
    const hook = renderHook(({ snap }) => useGameFx(snap, refs, pace), {
      initialProps: { snap: { view: view({ fighters: [william, opp], ...prev }) } as { view: PlayerView; events?: GameEvent[] } },
    });
    hook.rerender({ snap: { view: view({ fighters: [opp], ...next }), events } });
    return hook;
  };
  const step = (ms: number) => act(() => jest.advanceTimersByTime(ms));

  it("lands the hit, then the revive callout (text-sized kind), never a K.O.", () => {
    const { result } = run({ fighters: [springtrap, opp] });
    expect(result.current.boardFx.map((i) => [i.kind, i.label])).toEqual([["damage", "−2"]]);
    expect(played()).toEqual(["hit"]);

    step(STEP - 1);
    expect(played()).toEqual(["hit"]);
    step(1);
    expect(result.current.boardFx.map((i) => [i.kind, i.label])).toEqual([
      ["damage", "−2"],
      ["revive", "REVIVED: SPRINGTRAP"],
    ]);
    expect(played()).toEqual(["hit", "heal"]);

    step(1000);
    expect(played()).not.toContain("defeat");
    expect(result.current.hurtKey).toBe(1);
  });

  it("a same-window defeat: hit, revive, then the K.O.", () => {
    const { result } = run({ fighters: [springtrapDown, opp] });
    expect(played()).toEqual(["hit"]);
    step(STEP);
    expect(played()).toEqual(["hit", "heal"]);
    step(STEP);
    expect(played()).toEqual(["hit", "heal", "defeat"]);
    expect(result.current.boardFx.map((i) => i.kind)).toEqual(["damage", "revive", "defeat"]);
  });

  it("waits for the arc to land the hit before the revive", () => {
    const refs: GameFxRefs = {
      fighterEls: { current: new Map([["p1/hero", measurable()]]) },
      clashRef: { current: measurable() },
    };
    const { result } = run(
      { fighters: [springtrap, opp], combat: null },
      { prev: { combat: combat({}) }, events: [{ type: "COMBAT_DAMAGE", amount: 4 } as GameEvent], refs }
    );
    expect(played()).toEqual([]); // the projectile carries the hit

    step(ARC_LAUNCH_MS);
    expect(result.current.arcs).toHaveLength(1);
    step(ARC_FLIGHT_MS);
    expect(played()).toEqual(["hit"]);

    // revive at arcLaunchMs + arcFlightMs + step
    step(STEP - 1);
    expect(played()).toEqual(["hit"]);
    step(1);
    expect(played()).toEqual(["hit", "heal"]);
    expect(result.current.boardFx.map((i) => i.kind)).toEqual(["damage", "revive"]);
  });

  it("scales the step with pace", () => {
    run({ fighters: [springtrapDown, opp] }, { pace: 2 });
    expect(played()).toEqual(["hit"]);
    step(2 * STEP - 1);
    expect(played()).toEqual(["hit"]);
    step(1);
    expect(played()).toEqual(["hit", "heal"]);
    step(2 * STEP - 1);
    expect(played()).toEqual(["hit", "heal"]);
    step(1);
    expect(played()).toEqual(["hit", "heal", "defeat"]);
  });

  it("clears pending revive timers on unmount", () => {
    const { unmount } = run({ fighters: [springtrapDown, opp] });
    expect(played()).toEqual(["hit"]);
    unmount();
    step(5000);
    expect(played()).toEqual(["hit"]);
  });

  it("a revive + K.O. that ends the game: the fanfare trails the K.O.", () => {
    run({ fighters: [springtrapDown, opp], winner: "p2" });
    expect(played()).toEqual(["hit"]);
    step(STEP);
    expect(played()).toEqual(["hit", "heal"]);
    step(STEP);
    expect(played()).toEqual(["hit", "heal", "defeat"]);
    step(STEP - 1);
    expect(played()).toEqual(["hit", "heal", "defeat"]);
    step(1);
    expect(played()).toEqual(["hit", "heal", "defeat", "loss"]);
  });

  it("a game-ending K.O. without a revive keeps the fanfare on the same beat", () => {
    const babaDown = { ...opp, hp: 0, space: null, defeated: true };
    run({ fighters: [william, babaDown], winner: "p1" }, { prev: { fighters: [william, opp] } });
    expect(played()).toEqual(["hit-heavy", "defeat", "victory"]);
  });
});
