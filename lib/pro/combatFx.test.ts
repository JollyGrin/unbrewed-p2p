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
  fighters: [],
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

  describe("scheme card-reveal (v10 events)", () => {
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

    it("dedupes identical scheme sources within one batch", () => {
      const v = view({});
      const events: GameEvent[] = [
        { type: "SCHEME_PLAYED", player: "p1", card: "king-kong/plan#1" },
        { type: "SCHEME_PLAYED", player: "p1", card: "king-kong/plan#1" },
      ];
      expect(diffCombatCallouts(v, v, events)).toEqual([{ kind: "reveal", source: "king-kong/plan#1" }]);
    });

    it("emits no reveal when the events stream is empty (pre-v10 server)", () => {
      const v = view({});
      expect(diffCombatCallouts(v, v, [])).toEqual([]);
    });
  });

  describe("effect ribbon — fired During/After-Combat effect (issue #380)", () => {
    it("maps fireAt START to the during-combat window", () => {
      const v = view({});
      const events: GameEvent[] = [{ type: "EFFECT_FIRED", source: "king-kong/rampage#2", fireAt: "START" }];
      expect(diffCombatCallouts(v, v, events)).toEqual([
        { kind: "effect", source: "king-kong/rampage#2", window: "during" },
      ]);
    });

    it("maps fireAt END to the during-combat window", () => {
      const v = view({});
      const events: GameEvent[] = [{ type: "EFFECT_FIRED", source: "king-kong/rampage#2", fireAt: "END" }];
      expect(diffCombatCallouts(v, v, events)).toEqual([
        { kind: "effect", source: "king-kong/rampage#2", window: "during" },
      ]);
    });

    it("maps fireAt COMBAT_END to the after-combat window", () => {
      const v = view({});
      const events: GameEvent[] = [{ type: "EFFECT_FIRED", source: "king-kong/plan#1", fireAt: "COMBAT_END" }];
      expect(diffCombatCallouts(v, v, events)).toEqual([
        { kind: "effect", source: "king-kong/plan#1", window: "after" },
      ]);
    });

    it("passes a redacted source through as '(hidden)' for generic rendering", () => {
      const v = view({});
      const events: GameEvent[] = [{ type: "EFFECT_FIRED", source: "(hidden)", fireAt: "END" }];
      expect(diffCombatCallouts(v, v, events)).toEqual([
        { kind: "effect", source: "(hidden)", window: "during" },
      ]);
    });

    it("dedupes identical effect sources within one batch", () => {
      const v = view({});
      const events: GameEvent[] = [
        { type: "EFFECT_FIRED", source: "king-kong/plan#1", fireAt: "COMBAT_END" },
        { type: "EFFECT_FIRED", source: "king-kong/plan#1", fireAt: "COMBAT_END" },
      ];
      expect(diffCombatCallouts(v, v, events)).toEqual([
        { kind: "effect", source: "king-kong/plan#1", window: "after" },
      ]);
    });

    it("emits a plain reveal AND a ribboned effect when a card both plays and fires", () => {
      const v = view({});
      const events: GameEvent[] = [
        { type: "SCHEME_PLAYED", player: "p1", card: "king-kong/plan#1" },
        { type: "EFFECT_FIRED", source: "king-kong/plan#1", fireAt: "COMBAT_END" },
      ];
      expect(diffCombatCallouts(v, v, events)).toEqual([
        { kind: "reveal", source: "king-kong/plan#1" },
        { kind: "effect", source: "king-kong/plan#1", window: "after" },
      ]);
    });

    it("emits two effects in one batch (the overlay staggers them)", () => {
      const v = view({});
      const events: GameEvent[] = [
        { type: "EFFECT_FIRED", source: "king-kong/rampage#2", fireAt: "START" },
        { type: "EFFECT_FIRED", source: "king-kong/plan#1", fireAt: "COMBAT_END" },
      ];
      expect(diffCombatCallouts(v, v, events)).toEqual([
        { kind: "effect", source: "king-kong/rampage#2", window: "during" },
        { kind: "effect", source: "king-kong/plan#1", window: "after" },
      ]);
    });

    it("emits no effect when the events stream is empty (pre-v10 / reconnect)", () => {
      const v = view({});
      expect(diffCombatCallouts(v, v, [])).toEqual([]);
    });
  });

  describe("The Snuff — cancel callout (issues #346, #350)", () => {
    // A combat whose faces are already revealed, plus a catalog that prices them.
    const revealedCombat = combat({
      stage: "IMMEDIATELY",
      attackerCard: { instance: "king-kong/clobber#2", role: "ATTACK", boosts: [], effectiveValue: 3 },
      defenderCard: { instance: "baba-yaga/feint#1", role: "DEFENSE", boosts: [], effectiveValue: 0 },
      additionalDefenseCard: null,
    });
    const pricedCatalog: PlayerView["catalog"] = {
      "king-kong/clobber": { title: "Clobber", type: "attack", value: 3, boost: 2 },
      "baba-yaga/feint": { title: "Feint", type: "defense", value: 0, boost: 1 },
    };

    it("emits a cancel naming the victim side from EFFECT_CANCELED.role", () => {
      const v = view({ combat: revealedCombat, catalog: pricedCatalog });
      const events: GameEvent[] = [{ type: "EFFECT_CANCELED", role: "ATTACK", scope: "ALL" }];
      // No CARDS_REVEALED / COMBAT_DAMAGE in the batch: faces fall back to the live
      // combat view, the pill to the victim's printed catalog value.
      expect(diffCombatCallouts(v, v, events)).toEqual([
        { kind: "cancel", role: "ATTACK", victim: "king-kong/clobber#2", canceller: "baba-yaga/feint#1", value: 3 },
      ]);
    });

    it("dedupes multiple cancels of the same side within one batch", () => {
      const v = view({ combat: revealedCombat, catalog: pricedCatalog });
      const events: GameEvent[] = [
        { type: "EFFECT_CANCELED", role: "DEFENSE", scope: "ALL" },
        { type: "EFFECT_CANCELED", role: "DEFENSE", scope: "TEXT" },
      ];
      expect(diffCombatCallouts(v, v, events)).toEqual([
        { kind: "cancel", role: "DEFENSE", victim: "baba-yaga/feint#1", canceller: "king-kong/clobber#2", value: 0 },
      ]);
    });

    it("emits one cancel per side when both are cancelled", () => {
      const v = view({ combat: revealedCombat, catalog: pricedCatalog });
      const events: GameEvent[] = [
        { type: "EFFECT_CANCELED", role: "ATTACK", scope: "ALL" },
        { type: "EFFECT_CANCELED", role: "DEFENSE", scope: "ALL" },
      ];
      expect(diffCombatCallouts(v, v, events)).toEqual([
        { kind: "cancel", role: "ATTACK", victim: "king-kong/clobber#2", canceller: "baba-yaga/feint#1", value: 3 },
        { kind: "cancel", role: "DEFENSE", victim: "baba-yaga/feint#1", canceller: "king-kong/clobber#2", value: 0 },
      ]);
    });

    it("emits no cancel when the events stream is empty (pre-v10 server)", () => {
      const v = view({ combat: revealedCombat, catalog: pricedCatalog });
      expect(diffCombatCallouts(v, v, [])).toEqual([]);
    });

    // Issue #350 — the Feint-ends-combat one-drive case: EFFECT_CANCELED rides the
    // same STATE message as COMBAT_DAMAGE/RESOLVED/ENDED, so next.combat is already
    // null. Faces MUST come from the batch's CARDS_REVEALED, the pill from COMBAT_DAMAGE.
    it("captures faces from CARDS_REVEALED and the pill from COMBAT_DAMAGE when combat already ended", () => {
      const prev = view({ combat: combat({ stage: "IMMEDIATELY" }), catalog: pricedCatalog });
      const next = view({ combat: null, catalog: pricedCatalog });
      const events: GameEvent[] = [
        { type: "CARDS_REVEALED", attackerCard: "king-kong/clobber#2", defenderCard: "baba-yaga/feint#1" },
        { type: "EFFECT_CANCELED", role: "ATTACK", scope: "ALL" },
        { type: "COMBAT_DAMAGE", amount: 2 },
      ];
      expect(diffCombatCallouts(prev, next, events)).toEqual([
        // victim = ATTACK (clobber), canceller = the opposite defender card; the pill
        // reads the net COMBAT_DAMAGE (2), NOT the printed value (3), because damage resolved.
        { kind: "cancel", role: "ATTACK", victim: "king-kong/clobber#2", canceller: "baba-yaga/feint#1", value: 2 },
      ]);
    });

    // Same one-drive batch, but the cancel resolved before damage did: no COMBAT_DAMAGE
    // rides along, so the pill falls back to the victim's printed catalog value while the
    // faces still come straight from CARDS_REVEALED.
    it("falls back to the printed catalog value when the batch carries no COMBAT_DAMAGE", () => {
      const prev = view({ combat: combat({ stage: "IMMEDIATELY" }), catalog: pricedCatalog });
      const next = view({ combat: null, catalog: pricedCatalog });
      const events: GameEvent[] = [
        { type: "CARDS_REVEALED", attackerCard: "king-kong/clobber#2", defenderCard: "baba-yaga/feint#1" },
        { type: "EFFECT_CANCELED", role: "ATTACK", scope: "ALL" },
      ];
      expect(diffCombatCallouts(prev, next, events)).toEqual([
        // victim = ATTACK (clobber, printed value 3); pill falls back to that catalog value.
        { kind: "cancel", role: "ATTACK", victim: "king-kong/clobber#2", canceller: "baba-yaga/feint#1", value: 3 },
      ]);
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
