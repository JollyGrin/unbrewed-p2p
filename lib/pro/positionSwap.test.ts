import { diffPositionSwaps, swappedFighters } from "./positionSwap";
import { GameEvent, PlayerView, ViewFighter } from "./protocol";

const fighter = (over: Partial<ViewFighter>): ViewFighter => ({
  id: "p1/hero",
  owner: "p1",
  kind: "HERO",
  name: "Skull Kid",
  space: "a1",
  tailSpace: null,
  hp: 12,
  maxHp: 12,
  reach: "MELEE",
  size: "NORMAL",
  defeated: false,
  ...over,
});

const view = (fighters: ViewFighter[], over: Partial<PlayerView> = {}): PlayerView => ({
  you: "p1",
  phase: "PLAY",
  turnNumber: 1,
  activePlayer: "p1",
  actionsRemaining: 2,
  turnPhase: "ACTION_SELECT",
  maneuver: null,
  map: { schemaVersion: "1", id: "m", meta: { title: "m", minPlayers: 2, maxPlayers: 2, specialRules: false }, zones: [], spaces: [] },
  catalog: {},
  fighters,
  tokens: [],
  self: { id: "p1", heroId: "skull-kid", hand: [], deckCount: 10, discard: [], committedCard: null, counters: {}, flags: {}, wonCombatThisTurn: false, lostCombatThisTurn: false, firstAttackThisTurn: false, playedACardThisTurn: false, tookDamageThisTurn: false },
  opponent: { id: "p2", heroId: "thrall", handCount: 5, deckCount: 10, discard: [], hasCommitted: false, counters: {}, flags: {}, wonCombatThisTurn: false, lostCombatThisTurn: false, firstAttackThisTurn: false, playedACardThisTurn: false, tookDamageThisTurn: false },
  players: [
    { id: "p1", heroId: "skull-kid", you: true, hand: [], handCount: 0, deckCount: 10, discard: [], committedCard: null, hasCommitted: false, counters: {}, flags: {}, wonCombatThisTurn: false, lostCombatThisTurn: false, firstAttackThisTurn: false, playedACardThisTurn: false, tookDamageThisTurn: false },
    { id: "p2", heroId: "thrall", you: false, handCount: 5, deckCount: 10, discard: [], hasCommitted: false, counters: {}, flags: {}, wonCombatThisTurn: false, lostCombatThisTurn: false, firstAttackThisTurn: false, playedACardThisTurn: false, tookDamageThisTurn: false },
  ],
  combat: null,
  prompt: null,
  winner: null,
  ...over,
});

const mine = (over: Partial<ViewFighter> = {}) => fighter(over);
const theirs = (over: Partial<ViewFighter> = {}) =>
  fighter({ id: "p2/hero", owner: "p2", name: "Thrall", space: "b1", ...over });

const swap: GameEvent = {
  type: "POSITIONS_SWAPPED",
  a: "p1/hero",
  b: "p2/hero",
  aTo: ["b1"],
  bTo: ["a1"],
};

describe("swappedFighters", () => {
  it("names both sides of every swap in the batch", () => {
    expect([...swappedFighters([swap])]).toEqual(["p1/hero", "p2/hero"]);
  });

  it("is empty for a pre-v31 / swap-free batch", () => {
    expect(swappedFighters([]).size).toBe(0);
    expect(swappedFighters([{ type: "FIGHTER_MOVED", fighter: "p1/hero", path: ["a1", "a2"] }]).size).toBe(0);
  });
});

describe("diffPositionSwaps", () => {
  it("stays silent on the first snapshot (a state dump is not a play)", () => {
    expect(diffPositionSwaps(null, view([mine(), theirs()]), [swap])).toEqual([]);
  });

  it("stays silent without a POSITIONS_SWAPPED (an ordinary move is not a swap)", () => {
    const prev = view([mine({ space: "a1" })]);
    const next = view([mine({ space: "a2" })]);
    expect(diffPositionSwaps(prev, next, [])).toEqual([]);
  });

  it("emits a beat per fighter, carrying the pose each held BEFORE the swap", () => {
    const prev = view([mine({ space: "a1" }), theirs({ space: "b1" })]);
    const next = view([mine({ space: "b1" }), theirs({ space: "a1" })]);
    // BOTH seats' figures: a swap is never a move the viewer committed
    // optimistically, so there is no local tween to double-drive.
    expect(diffPositionSwaps(prev, next, [swap])).toEqual([
      { fighterId: "p1/hero", from: "a1", fromTail: null },
      { fighterId: "p2/hero", from: "b1", fromTail: null },
    ]);
  });

  it("carries a LARGE body's trailing space too", () => {
    const prev = view([mine({ space: "a1", tailSpace: "a2", size: "LARGE" }), theirs({ space: "b1" })]);
    const next = view([mine({ space: "b1", tailSpace: "b2", size: "LARGE" }), theirs({ space: "a1" })]);
    expect(diffPositionSwaps(prev, next, [swap])).toContainEqual({
      fighterId: "p1/hero",
      from: "a1",
      fromTail: "a2",
    });
  });

  it("drops a fighter that did not actually change space (a replayed batch)", () => {
    const v = view([mine({ space: "a1" }), theirs({ space: "b1" })]);
    expect(diffPositionSwaps(v, v, [swap])).toEqual([]);
  });

  it("ignores a fighter that left the board entirely", () => {
    const prev = view([mine({ space: "a1" }), theirs({ space: "b1" })]);
    const next = view([mine({ space: null }), theirs({ space: "a1" })]);
    expect(diffPositionSwaps(prev, next, [swap])).toEqual([
      { fighterId: "p2/hero", from: "b1", fromTail: null },
    ]);
  });
});
