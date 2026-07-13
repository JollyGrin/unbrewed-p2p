import { diffCombatCallouts } from "./combatFx";
import { GameEvent, PlayerView, ViewCombat } from "./protocol";

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
  fighters: [],
  tokens: [],
  self: { id: "p1", heroId: "king-kong", hand: [], deckCount: 10, discard: [], committedCard: null, counters: {}, flags: {}, wonCombatThisTurn: false },
  opponent: { id: "p2", heroId: "baba-yaga", handCount: 5, deckCount: 10, discard: [], hasCommitted: false, counters: {}, flags: {}, wonCombatThisTurn: false },
  players: [
    { id: "p1", heroId: "fixture-p1", you: true, hand: [], handCount: 0, deckCount: 10, discard: [], committedCard: null, hasCommitted: false, counters: {}, flags: {}, wonCombatThisTurn: false },
    { id: "p2", heroId: "fixture-p2", you: false, handCount: 5, deckCount: 10, discard: [], hasCommitted: false, counters: {}, flags: {}, wonCombatThisTurn: false },
  ],
  combat: null,
  prompt: null,
  winner: null,
  ...over,
});

describe("diffCombatCallouts", () => {
  it("emits nothing on the first snapshot (join/reconnect is not a play)", () => {
    expect(diffCombatCallouts(null, view({}), [])).toEqual([]);
  });

  it("emits nothing when nothing changed", () => {
    const v = view({});
    expect(diffCombatCallouts(v, v, [])).toEqual([]);
  });

  describe("YOUR TURN banner", () => {
    it("fires (mine) when the active player flips to you", () => {
      const prev = view({ activePlayer: "p2" });
      const next = view({ activePlayer: "p1" });
      expect(diffCombatCallouts(prev, next, [])).toEqual([{ kind: "turn", mine: true }]);
    });

    it("fires (dimmer variant) when it becomes the opponent's turn", () => {
      const prev = view({ activePlayer: "p1" });
      const next = view({ activePlayer: "p2" });
      expect(diffCombatCallouts(prev, next, [])).toEqual([{ kind: "turn", mine: false }]);
    });

    it("does not fire when the active player is unchanged", () => {
      const v = view({ activePlayer: "p1" });
      expect(diffCombatCallouts(v, view({ activePlayer: "p1", turnNumber: 2 }), [])).toEqual([]);
    });
  });

  describe("DEFEND! pulse", () => {
    it("fires when combat reaches commit-defense and you are the defender", () => {
      const prev = view({ combat: combat({ stage: "COMMIT_ATTACK", defenderPlayer: "p1" }) });
      const next = view({ combat: combat({ stage: "COMMIT_DEFENSE", defenderPlayer: "p1" }) });
      expect(diffCombatCallouts(prev, next, [])).toEqual([{ kind: "defend" }]);
    });

    it("does not fire when YOU are the attacker committing", () => {
      const prev = view({ combat: combat({ stage: "COMMIT_ATTACK", defenderPlayer: "p2" }) });
      const next = view({ combat: combat({ stage: "COMMIT_DEFENSE", defenderPlayer: "p2" }) });
      expect(diffCombatCallouts(prev, next, [])).toEqual([]);
    });

    it("does not re-fire while already in commit-defense", () => {
      const v = view({ combat: combat({ stage: "COMMIT_DEFENSE", defenderPlayer: "p1" }) });
      expect(diffCombatCallouts(v, v, [])).toEqual([]);
    });
  });

  describe("scheme / effect card-reveal (v10 events)", () => {
    it("reveals a played scheme's source card", () => {
      const v = view({});
      const events: GameEvent[] = [{ type: "SCHEME_PLAYED", player: "p2", card: "baba-yaga/hex#1" }];
      expect(diffCombatCallouts(v, v, events)).toEqual([{ kind: "reveal", source: "baba-yaga/hex#1" }]);
    });

    it("reveals Buster nested STUNT plays and random hand reveals", () => {
      const v = view({});
      const events: GameEvent[] = [
        { type: "CARD_PLAYED_FROM_HAND", player: "p1", card: "buster-keaton/stunt-falling-house#1" },
        { type: "CARD_REVEALED", player: "p2", card: "buster-keaton/porkpie-hat#1" },
      ];
      expect(diffCombatCallouts(v, v, events)).toEqual([
        { kind: "reveal", source: "buster-keaton/stunt-falling-house#1" },
        { kind: "reveal", source: "buster-keaton/porkpie-hat#1" },
      ]);
    });

    it("reveals a fired delayed effect's source", () => {
      const v = view({});
      const events: GameEvent[] = [{ type: "EFFECT_FIRED", source: "king-kong/rampage#2", fireAt: "START" }];
      expect(diffCombatCallouts(v, v, events)).toEqual([{ kind: "reveal", source: "king-kong/rampage#2" }]);
    });

    it("passes a redacted source through as '(hidden)' for generic rendering", () => {
      const v = view({});
      const events: GameEvent[] = [{ type: "EFFECT_FIRED", source: "(hidden)", fireAt: "END" }];
      expect(diffCombatCallouts(v, v, events)).toEqual([{ kind: "reveal", source: "(hidden)" }]);
    });

    it("dedupes identical sources within one batch", () => {
      const v = view({});
      const events: GameEvent[] = [
        { type: "SCHEME_PLAYED", player: "p1", card: "king-kong/plan#1" },
        { type: "EFFECT_FIRED", source: "king-kong/plan#1", fireAt: "COMBAT_END" },
      ];
      expect(diffCombatCallouts(v, v, events)).toEqual([{ kind: "reveal", source: "king-kong/plan#1" }]);
    });

    it("emits no reveal when the events stream is empty (pre-v10 server)", () => {
      const v = view({});
      expect(diffCombatCallouts(v, v, [])).toEqual([]);
    });
  });

  it("emits a turn banner and a reveal together in one batch", () => {
    const prev = view({ activePlayer: "p2" });
    const next = view({ activePlayer: "p1" });
    const events: GameEvent[] = [{ type: "SCHEME_PLAYED", player: "p1", card: "king-kong/plan#1" }];
    expect(diffCombatCallouts(prev, next, events)).toEqual([
      { kind: "turn", mine: true },
      { kind: "reveal", source: "king-kong/plan#1" },
    ]);
  });
});
