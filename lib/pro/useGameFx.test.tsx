/**
 * The revive batch's ORDER at the table (issue #1532): the hit that emptied William's
 * old dial lands first, the "REVIVED" callout trails it, and a same-window K.O. comes
 * last — instead of all three on top of each other (or the revive with no hit at all).
 */
import { act, renderHook } from "@testing-library/react";
import { useGameFx } from "./useGameFx";
import { sfx } from "./sfx";
import { PlayerView, ViewFighter } from "./protocol";

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

describe("useGameFx — a revive batch", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    (sfx.play as jest.Mock).mockClear();
  });
  afterEach(() => jest.useRealTimers());

  const run = (next: ViewFighter) => {
    const { result, rerender } = renderHook(({ snap }) => useGameFx(snap), {
      initialProps: { snap: { view: view({ fighters: [william, opp] }) } },
    });
    rerender({ snap: { view: view({ fighters: [next, opp] }) } });
    return result;
  };

  it("lands the hit, then the revive callout (text-sized kind), never a K.O.", () => {
    const result = run({ ...william, name: "Springtrap", hp: 12, maxHp: 12 });
    expect(result.current.boardFx.map((i) => [i.kind, i.label])).toEqual([["damage", "−2"]]);
    expect(played()).toEqual(["hit"]);

    act(() => jest.advanceTimersByTime(400));
    expect(result.current.boardFx.map((i) => [i.kind, i.label])).toEqual([
      ["damage", "−2"],
      ["revive", "REVIVED: SPRINGTRAP"],
    ]);
    expect(played()).toEqual(["hit", "heal"]);

    act(() => jest.advanceTimersByTime(1000));
    expect(played()).not.toContain("defeat");
    expect(result.current.hurtKey).toBe(1);
  });

  it("a same-window defeat: hit, revive, then the K.O.", () => {
    const result = run({ ...william, name: "Springtrap", hp: 0, maxHp: 12, space: null, defeated: true });
    expect(played()).toEqual(["hit"]);
    act(() => jest.advanceTimersByTime(400));
    expect(played()).toEqual(["hit", "heal"]);
    act(() => jest.advanceTimersByTime(400));
    expect(played()).toEqual(["hit", "heal", "defeat"]);
    expect(result.current.boardFx.map((i) => i.kind)).toEqual(["damage", "revive", "defeat"]);
  });
});
