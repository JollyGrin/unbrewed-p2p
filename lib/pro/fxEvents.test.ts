import { diffFxEvents } from "./fxEvents";
import { PlayerView, ViewCombat, ViewFighter } from "./protocol";

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
  defeated: false,
  ...over,
});

const combat = (over: Partial<ViewCombat>): ViewCombat => ({
  attackerPlayer: "p1",
  defenderPlayer: "p2",
  attacker: "p1/hero",
  target: "p2/hero",
  stage: "COMMIT_ATTACK",
  attackerCard: null,
  defenderCard: null,
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
  self: { id: "p1", heroId: "king-kong", hand: [], deckCount: 10, discard: [], committedCard: null, counters: {} },
  opponent: { id: "p2", heroId: "baba-yaga", handCount: 5, deckCount: 10, discard: [], hasCommitted: false, counters: {} },
  players: [
    { id: "p1", heroId: "fixture-p1", you: true, hand: [], handCount: 0, deckCount: 10, discard: [], committedCard: null, hasCommitted: false, counters: {} },
    { id: "p2", heroId: "fixture-p2", you: false, handCount: 5, deckCount: 10, discard: [], hasCommitted: false, counters: {} },
  ],
  combat: null,
  prompt: null,
  winner: null,
  ...over,
});

describe("diffFxEvents", () => {
  it("emits nothing on the first snapshot (join/reconnect is not a play)", () => {
    expect(diffFxEvents(null, view({}))).toEqual([]);
  });

  it("emits nothing when nothing changed", () => {
    const v = view({});
    expect(diffFxEvents(v, v)).toEqual([]);
  });

  it("detects damage with amount, space and ownership", () => {
    const prev = view({});
    const next = view({
      fighters: [fighter({ hp: 7 }), fighter({ id: "p2/hero", owner: "p2", space: "s2" })],
    });
    expect(diffFxEvents(prev, next)).toEqual([
      { type: "damage", fighter: "p1/hero", space: "s1", amount: 3, mine: true, heroHit: true },
    ]);
  });

  it("falls back to the previous space when a defeated fighter left the board", () => {
    const prev = view({});
    const next = view({
      fighters: [
        fighter({}),
        fighter({ id: "p2/hero", owner: "p2", space: null, hp: 0, defeated: true }),
      ],
    });
    const events = diffFxEvents(prev, next);
    expect(events).toContainEqual({ type: "defeated", fighter: "p2/hero", space: "s2", mine: false });
    expect(events).toContainEqual(
      expect.objectContaining({ type: "damage", fighter: "p2/hero", space: "s2", amount: 10 })
    );
  });

  it("detects heals", () => {
    const prev = view({ fighters: [fighter({ hp: 5 }), fighter({ id: "p2/hero", owner: "p2", space: "s2" })] });
    const next = view({ fighters: [fighter({ hp: 8 }), fighter({ id: "p2/hero", owner: "p2", space: "s2" })] });
    expect(diffFxEvents(prev, next)).toEqual([
      { type: "heal", fighter: "p1/hero", space: "s1", amount: 3, mine: true },
    ]);
  });

  it("emits a single reveal with count 2 when both cards flip together", () => {
    const prev = view({ combat: combat({ stage: "COMMIT_DEFENSE" }) });
    const next = view({
      combat: combat({
        stage: "DAMAGE",
        attackerCard: { instance: "king-kong/clobber#1", role: "ATTACK", boosts: [], effectiveValue: 3 },
        defenderCard: { instance: "baba-yaga/hex#1", role: "DEFENSE", boosts: [], effectiveValue: 2 },
      }),
    });
    expect(diffFxEvents(prev, next)).toEqual([{ type: "reveal", count: 2 }]);
  });

  it("flags a blocked outcome only when zero damage was dealt", () => {
    const prev = view({ combat: combat({ stage: "DAMAGE" }) });
    const blocked = view({
      combat: combat({ stage: "CLEANUP", outcome: "DEFENDER_WON", attackDamageDealt: 0 }),
    });
    expect(diffFxEvents(prev, blocked)).toEqual([{ type: "blocked", space: "s2" }]);

    const hit = view({
      combat: combat({ stage: "CLEANUP", outcome: "ATTACKER_WON", attackDamageDealt: 2 }),
      fighters: [fighter({}), fighter({ id: "p2/hero", owner: "p2", space: "s2", hp: 8 })],
    });
    expect(diffFxEvents(prev, hit).map((e) => e.type)).toEqual(["damage"]);
  });

  it("detects commits from either seat", () => {
    const prev = view({});
    const selfCommit = view({ self: { ...prev.self, committedCard: "king-kong/clobber#1" } });
    expect(diffFxEvents(prev, selfCommit)).toEqual([{ type: "commit" }]);
    const oppCommit = view({ opponent: { ...prev.opponent!, hasCommitted: true } });
    expect(diffFxEvents(prev, oppCommit)).toEqual([{ type: "commit" }]);
  });

  it("detects draws for either seat, once", () => {
    const prev = view({});
    const next = view({
      self: { ...prev.self, hand: ["king-kong/clobber#1"], deckCount: 9 },
      opponent: { ...prev.opponent!, handCount: 6, deckCount: 9 },
    });
    expect(diffFxEvents(prev, next)).toEqual([{ type: "draw" }]);
  });

  it("announces your turn but not the opponent's", () => {
    const prev = view({ activePlayer: "p2" });
    expect(diffFxEvents(prev, view({ activePlayer: "p1", turnNumber: 2 }))).toEqual([{ type: "turn" }]);
    expect(diffFxEvents(view({}), view({ activePlayer: "p2", turnNumber: 2 }))).toEqual([]);
  });

  it("prefers victory/loss over a turn cue when the game ends", () => {
    const prev = view({ activePlayer: "p2" });
    expect(diffFxEvents(prev, view({ winner: "p1" }))).toEqual([{ type: "victory" }]);
    expect(diffFxEvents(prev, view({ winner: "p2" }))).toEqual([{ type: "loss" }]);
  });
});
