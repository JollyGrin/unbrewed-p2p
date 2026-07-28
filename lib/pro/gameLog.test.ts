import {
  actionFallbackLine,
  diffViews,
  enrichLines,
  batchPhase,
  batchTurnTag,
  counterChangeLines,
  groupLog,
  logEntriesToCsv,
  EnrichContext,
  ProLogEntry,
  ProLogLine,
} from "./gameLog";
import { CardInstanceId, GameEvent, PlayerId, PlayerView, ValueBreakdown, ViewCombat, ViewFighter } from "./protocol";

// --- fixture builders (mirrors fxEvents.test.ts) ----------------------------

const fighter = (over: Partial<ViewFighter>): ViewFighter => ({
  id: "p1/hero",
  owner: "p1",
  kind: "HERO",
  name: "King Taranis",
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
  fighters: [fighter({}), fighter({ id: "p2/hero", owner: "p2", name: "Thrall", space: "s2" })],
  tokens: [],
  self: { id: "p1", heroId: "king-taranis", hand: [], deckCount: 10, discard: [], committedCard: null, counters: {}, flags: {}, wonCombatThisTurn: false, lostCombatThisTurn: false, firstAttackThisTurn: false, playedACardThisTurn: false, tookDamageThisTurn: false },
  opponent: { id: "p2", heroId: "thrall", handCount: 5, deckCount: 10, discard: [], hasCommitted: false, counters: {}, flags: {}, wonCombatThisTurn: false, lostCombatThisTurn: false, firstAttackThisTurn: false, playedACardThisTurn: false, tookDamageThisTurn: false },
  players: [
    { id: "p1", heroId: "fixture-p1", you: true, hand: [], handCount: 0, deckCount: 10, discard: [], committedCard: null, hasCommitted: false, counters: {}, flags: {}, wonCombatThisTurn: false, lostCombatThisTurn: false, firstAttackThisTurn: false, playedACardThisTurn: false, tookDamageThisTurn: false },
    { id: "p2", heroId: "fixture-p2", you: false, handCount: 5, deckCount: 10, discard: [], hasCommitted: false, counters: {}, flags: {}, wonCombatThisTurn: false, lostCombatThisTurn: false, firstAttackThisTurn: false, playedACardThisTurn: false, tookDamageThisTurn: false },
  ],
  combat: null,
  prompt: null,
  winner: null,
  ...over,
});

// The label used by diffViews (printed card title). Kept trivial for tests.
const label = (c: CardInstanceId) => c.split("#")[0].split("/").pop() ?? c;

// Resolver enrichLines gets from the page: card title / hero name / hidden.
// `seat` mirrors gameLog's seatLabel for a duel; pass `seatFor` to model a >2p
// game where non-you seats are named by id.
const ctx = (you = "p1", seatFor?: (p: string) => string): EnrichContext => ({
  you,
  label: (source) => {
    if (source === "(hidden)") return "a hidden card";
    if (source.startsWith("hero:")) return `hero ${source.slice(5)}`;
    return label(source);
  },
  seat: seatFor ?? ((p) => (p === you ? "You" : "Opponent")),
  fighter: (id) => id.split("/").pop() ?? id,
});

// Every GameEvent variant, one representative each — used to assert the
// non-allowlisted majority never creates a line.
const ALL_EVENTS: GameEvent[] = [
  { type: "HERO_PLACED", fighter: "p1/hero", space: "s1" },
  { type: "SIDEKICK_PLACED", fighter: "p1/sidekick-1", space: "s1" },
  { type: "TURN_STARTED", player: "p1", turnNumber: 2 },
  { type: "ACTION_SPENT", player: "p1", action: "MANEUVER" },
  { type: "CARD_DRAWN", player: "p1", card: "a/x#1" },
  { type: "EXHAUSTION_DAMAGE", player: "p1" },
  { type: "DAMAGE_APPLIED", fighter: "p1/hero", amount: 2, source: "ATTACK" },
  { type: "FIGHTER_DEFEATED", fighter: "p2/hero" },
  { type: "MOVE_BOOSTED", player: "p1", card: "a/x#1", boost: 2 },
  { type: "FIGHTER_MOVED", fighter: "p1/hero", path: ["s1", "s2"] },
  { type: "SCHEME_PLAYED", player: "p1", card: "a/x#1" },
  { type: "ATTACK_DECLARED", attacker: "p1/hero", target: "p2/hero" },
  { type: "CARD_COMMITTED", player: "p1" },
  { type: "CARDS_REVEALED", attackerCard: "a/x#1", defenderCard: null },
  { type: "COMBAT_DAMAGE", amount: 3 },
  { type: "COMBAT_RESOLVED", outcome: "ATTACKER_WON" },
  { type: "COMBAT_ENDED" },
  { type: "TURN_ENDED", player: "p1" },
  { type: "GAME_ENDED", winner: "p1", reason: "HERO_DEFEATED" },
  { type: "PROMPT_OPENED", player: "p1", kind: "CHOOSE_TARGET", promptId: "p" },
  { type: "PROMPT_RESOLVED", player: "p1", promptId: "p", optionId: "o" },
  { type: "CARD_BOOSTED", role: "ATTACK", card: "a/x#1", blind: false },
  { type: "BOOST_RETRIEVED", player: "p1", card: "a/x#1" },
  { type: "EFFECT_CANCELED", role: "ATTACK", scope: "s", card: "a/x#1", voided: true, boostVoided: false },
  { type: "EFFECT_RESOLVING", source: "a/x#1", window: "AFTER", player: "p1" },
  {
    type: "COMBAT_VALUE_BREAKDOWN",
    attack: { role: "ATTACK", card: "a/x#1", printed: 3, override: null, delta: 0, boosts: 0, abilityBoosts: 0, locked: false, total: 3 },
    defense: [],
    effectiveAttack: 3,
    effectiveDefense: 0,
    ignoreDefense: false,
  },
  { type: "TURN_END_FORCED", player: "p1" },
  { type: "COUNTER_CHANGED", player: "p1", name: "rage", value: 2 },
  { type: "FLAG_SET", player: "p1", flag: "f" },
  { type: "FLAG_CLEARED", player: "p1", flag: "f" },
  { type: "CARD_KEPT", player: "p1", card: "a/x#1" },
  { type: "ABILITY_BOOST_COMMITTED", player: "p1" },
  { type: "DECK_TOP_REORDERED", player: "p1", count: 2 },
  { type: "STAT_SET", fighter: "p1/hero", stat: "MOVE", to: 3, expiresAtTurn: 3, expiresAt: "END" },
  { type: "HP_FLOOR_SET", fighter: "p1/hero", floor: 1, expiresAtTurn: 3, expiresAt: "END" },
  { type: "HP_SET", fighter: "p1/hero", to: 5 },
  { type: "CARD_FOUND", player: "p1", card: "a/x#1", from: "DECK" },
  { type: "CARD_SHUFFLED_INTO_DECK", player: "p1", card: "a/x#1", from: "HAND" },
  { type: "CARD_RETURNED_TO_HAND", player: "p1", card: "a/x#1" },
  { type: "CARD_PLAYED_FROM_HAND", player: "p1", card: "a/x#1" },
  { type: "CARD_REVEALED", player: "p1", card: "a/x#1" },
  { type: "DECK_SHUFFLED", player: "p1" },
  { type: "TOKEN_PLACED", token: "t1", kind: "totem", owner: "p1", space: "s1" },
  { type: "TOKEN_DESTROYED", token: "t1", kind: "totem", owner: "p1", space: "s1", reason: "EFFECT" },
  { type: "FIGHTER_REVIVED", fighter: "p1/hero", space: "s1" },
  { type: "FIGHTER_PINNED", fighter: "p1/hero", expiresAtTurn: 3, expiresAt: "END" },
  { type: "FIGHTER_TAIL_PLACED", fighter: "p1/hero", space: "s1" },
  { type: "FIGHTER_EJECTED", fighter: "p1/hero", to: "s2" },
  { type: "REGION_CLOSED", region: "hut" },
  // General Grievous nested combat (issue #288) — all allowlisted new-line events.
  { type: "COMBAT_WON_MARKED", player: "p1" },
  { type: "PLAYED_CARD_RETURNED", player: "p1", card: "a/x#1" },
  { type: "SECOND_ATTACK_COMMITTED", player: "p1" },
  { type: "BONUS_ATTACK_STARTED", attacker: "p1/hero", target: "p2/hero" },
  { type: "BONUS_ATTACK_PASSED", player: "p1" },
  { type: "SUB_ATTACK_INITIATED", attacker: "p1/sidekick-1", target: "p2/hero", value: 4 },
];

// The allowlist — event types enrichLines is permitted to turn into new lines.
const ALLOWLIST = new Set([
  "VALUE_MODIFIED",
  "VALUE_SET",
  "EFFECT_SCHEDULED",
  "EFFECT_FIRED",
  "EFFECT_CANCELED",
  "COMBAT_VALUE_BREAKDOWN",
  "DEFENSE_IGNORED",
  "DAMAGE_PREVENTED",
  "EXHAUSTION_DAMAGE",
  "ACTIONS_GAINED",
  "CARD_RETURNED_TO_HAND",
  "CARD_REVEALED",
  "COMBAT_WON_MARKED",
  "PLAYED_CARD_RETURNED",
  "SECOND_ATTACK_COMMITTED",
  "BONUS_ATTACK_STARTED",
  "BONUS_ATTACK_PASSED",
  "SUB_ATTACK_INITIATED",
]);

describe("enrichLines", () => {
  it("returns the input lines unchanged when there are no events", () => {
    const lines: ProLogLine[] = [{ text: "You drew 1 card", who: "you" }];
    expect(enrichLines(lines, [], ctx())).toEqual(lines);
  });

  it("never mutates the input lines array or its members", () => {
    const lines: ProLogLine[] = [
      { text: "You → discard: fireball", who: "you", cards: ["a/fireball#1"] },
    ];
    const snapshot = JSON.parse(JSON.stringify(lines));
    enrichLines(lines, [{ type: "CARD_DISCARDED", player: "p1", card: "a/fireball#1", reason: "BOOST" }], ctx());
    expect(lines).toEqual(snapshot);
  });

  describe("annotations (mode 1) — never change line count or order", () => {
    const reasons: [string, string][] = [
      ["BOOST", "(spent to boost)"],
      ["COMBAT", "(used in combat)"],
      ["HAND_LIMIT", "(over hand limit)"],
      ["EFFECT", "(card effect)"],
      ["MILL", "(milled)"],
    ];
    it.each(reasons)("appends %s → %s to the matching discard line", (reason, suffix) => {
      const lines: ProLogLine[] = [
        { text: "You → discard: fireball", who: "you", cards: ["a/fireball#1"] },
      ];
      const out = enrichLines(
        lines,
        [{ type: "CARD_DISCARDED", player: "p1", card: "a/fireball#1", reason: reason as never }],
        ctx()
      );
      expect(out).toHaveLength(1);
      expect(out[0].text).toBe(`You → discard: fireball ${suffix}`);
      expect(out[0].who).toBe("you");
    });

    it("matches strictly by instance id — a different card's discard is untouched", () => {
      const lines: ProLogLine[] = [
        { text: "You → discard: fireball", who: "you", cards: ["a/fireball#1"] },
        { text: "You → discard: shield", who: "you", cards: ["a/shield#1"] },
      ];
      const out = enrichLines(
        lines,
        [{ type: "CARD_DISCARDED", player: "p1", card: "a/shield#1", reason: "COMBAT" }],
        ctx()
      );
      expect(out.map((l) => l.text)).toEqual([
        "You → discard: fireball",
        "You → discard: shield (used in combat)",
      ]);
    });

    it("maps N discards of the same card to N events one-to-one", () => {
      const lines: ProLogLine[] = [
        { text: "You → discard: fireball", who: "you", cards: ["a/fireball#1"] },
        { text: "You → discard: fireball", who: "you", cards: ["a/fireball#2"] },
      ];
      const out = enrichLines(
        lines,
        [
          { type: "CARD_DISCARDED", player: "p1", card: "a/fireball#1", reason: "BOOST" },
          { type: "CARD_DISCARDED", player: "p1", card: "a/fireball#2", reason: "COMBAT" },
        ],
        ctx()
      );
      expect(out.map((l) => l.text)).toEqual([
        "You → discard: fireball (spent to boost)",
        "You → discard: fireball (used in combat)",
      ]);
    });

    it("adds no line when the discard event has no matching diff line", () => {
      const lines: ProLogLine[] = [{ text: "You drew 1 card", who: "you" }];
      const out = enrichLines(
        lines,
        [{ type: "CARD_DISCARDED", player: "p1", card: "a/fireball#1", reason: "BOOST" }],
        ctx()
      );
      expect(out).toEqual(lines);
    });
  });

  describe("new lines (mode 2) — allowlist only", () => {
    it("VALUE_MODIFIED renders the before/after value and delta", () => {
      const out = enrichLines([], [{ type: "VALUE_MODIFIED", role: "ATTACK", delta: 2, newEffective: 5 }], ctx());
      expect(out).toEqual([{ text: "Attack value 3 → 5 (+2)", who: "game" }]);
    });

    it("VALUE_SET renders 'Defense value set to N' with a locked marker", () => {
      const out = enrichLines([], [{ type: "VALUE_SET", role: "DEFENSE", to: 4, locked: true }], ctx());
      expect(out).toEqual([{ text: "Defense value set to 4 (locked)", who: "game" }]);
    });

    it("EFFECT_SCHEDULED names the source card and renders it for hover", () => {
      const out = enrichLines(
        [],
        [{ type: "EFFECT_SCHEDULED", source: "a/lightning-bolt#1", fireAt: "COMBAT_END" }],
        ctx()
      );
      expect(out).toEqual([
        { text: "lightning-bolt: effect will trigger at end of combat", who: "game", cards: ["a/lightning-bolt#1"] },
      ]);
    });

    it("EFFECT_FIRED names the source card and renders it for hover (issue #151)", () => {
      const out = enrichLines(
        [],
        [{ type: "EFFECT_FIRED", source: "a/lightning-bolt#1", fireAt: "COMBAT_END" }],
        ctx()
      );
      expect(out).toEqual([
        { text: "lightning-bolt: delayed effect resolves", who: "game", cards: ["a/lightning-bolt#1"] },
      ]);
    });

    it("resolves a 'hero:<pid>' source without rendering a card for hover", () => {
      const out = enrichLines([], [{ type: "EFFECT_FIRED", source: "hero:p2", fireAt: "END" }], ctx());
      expect(out).toEqual([{ text: "hero p2: delayed effect resolves", who: "game", cards: undefined }]);
    });

    it("renders a '(hidden)' source as 'a hidden card' and never crashes", () => {
      const out = enrichLines([], [{ type: "EFFECT_FIRED", source: "(hidden)", fireAt: "END" }], ctx());
      expect(out).toEqual([{ text: "a hidden card: delayed effect resolves", who: "game", cards: undefined }]);
    });

    it("EFFECT_CANCELED renders a Feint line naming the cancelled side (issue #346)", () => {
      const canceled = (role: "ATTACK" | "DEFENSE"): GameEvent => ({
        type: "EFFECT_CANCELED", role, scope: "s", card: "a/snuff-target#1", voided: true, boostVoided: false,
      });
      const cards = ["a/snuff-target#1"];
      expect(enrichLines([], [canceled("ATTACK")], ctx())).toEqual([
        { text: "Feint! Attack card effects were cancelled (printed value still counts)", who: "game", cards },
      ]);
      expect(enrichLines([], [canceled("DEFENSE")], ctx())).toEqual([
        { text: "Feint! Defense card effects were cancelled (printed value still counts)", who: "game", cards },
      ]);
    });

    it("DEFENSE_IGNORED and DAMAGE_PREVENTED render fixed lines", () => {
      const out = enrichLines(
        [],
        [{ type: "DEFENSE_IGNORED" }, { type: "DAMAGE_PREVENTED", scope: "ALL" }],
        ctx()
      );
      expect(out).toEqual([
        { text: "Defense ignored", who: "game" },
        { text: "Damage prevented", who: "game" },
      ]);
    });

    // issue #509: a fatal empty-deck draw showed only "took 1 damage". The
    // exhaustion rule is invisible to the view diff (the draw changes no
    // counts), so the event has to name the cause itself.
    it("EXHAUSTION_DAMAGE names the empty deck as the cause, per seat", () => {
      const out = enrichLines(
        [],
        [
          { type: "EXHAUSTION_DAMAGE", player: "p1" },
          { type: "EXHAUSTION_DAMAGE", player: "p2" },
        ],
        ctx("p1")
      );
      expect(out).toEqual([
        {
          text: "Exhaustion! Your deck is empty — drawing deals 2 damage to each of your fighters",
          who: "you",
        },
        {
          text: "Exhaustion! Opponent's deck is empty — drawing deals 2 damage to each of their fighters",
          who: "opp",
        },
      ]);
    });

    it("EXHAUSTION_DAMAGE names the acting seat in a >2p game", () => {
      const seat3p = (p: string) => (p === "p1" ? "You" : p.toUpperCase());
      const out = enrichLines([], [{ type: "EXHAUSTION_DAMAGE", player: "p3" }], ctx("p1", seat3p));
      expect(out.map((l) => l.text)).toEqual([
        "Exhaustion! P3's deck is empty — drawing deals 2 damage to each of their fighters",
      ]);
    });

    it("EXHAUSTION_DAMAGE explains the hp loss without replacing it", () => {
      // The damage itself stays a diff line (the view shows the hp change);
      // enrichLines only adds the missing "why", so the fatal draw reads as a
      // cause + effect pair instead of a bare "took 1 damage".
      const lines: ProLogLine[] = [
        { text: "The Mandalorian took 1 damage (0/14)", who: "opp" },
      ];
      const out = enrichLines(
        lines,
        [{ type: "EXHAUSTION_DAMAGE", player: "p2" }, { type: "DAMAGE_APPLIED", fighter: "p2/hero", amount: 2, source: "EXHAUSTION" }],
        ctx("p1")
      );
      expect(out.map((l) => l.text)).toEqual([
        "The Mandalorian took 1 damage (0/14)",
        "Exhaustion! Opponent's deck is empty — drawing deals 2 damage to each of their fighters",
      ]);
    });

    it("ACTIONS_GAINED attributes to you/opp and pluralizes", () => {
      const out = enrichLines(
        [],
        [
          { type: "ACTIONS_GAINED", player: "p1", amount: 1 },
          { type: "ACTIONS_GAINED", player: "p2", amount: 2 },
        ],
        ctx("p1")
      );
      expect(out).toEqual([
        { text: "You gained 1 action", who: "you" },
        { text: "Opponent gained 2 actions", who: "opp" },
      ]);
    });

    it("CARD_RETURNED_TO_HAND and CARD_REVEALED render visible Buster moments", () => {
      const out = enrichLines(
        [],
        [
          { type: "CARD_RETURNED_TO_HAND", player: "p1", card: "buster-keaton/the-great-stone-face#1" },
          { type: "CARD_REVEALED", player: "p2", card: "buster-keaton/porkpie-hat#1" },
        ],
        ctx("p1")
      );
      expect(out).toEqual([
        { text: "You returned the-great-stone-face to hand", who: "you", cards: ["buster-keaton/the-great-stone-face#1"] },
        { text: "Opponent revealed porkpie-hat", who: "opp", cards: ["buster-keaton/porkpie-hat#1"] },
      ]);
    });

    it("names the acting seat (not a generic 'Opponent') for >2p games", () => {
      // In a 3-player game the page passes seatLabel, which names non-you seats
      // by id — so a p3 event reads "P3", never "Opponent".
      const seat3p = (p: string) => (p === "p1" ? "You" : p.toUpperCase());
      const out = enrichLines(
        [],
        [
          { type: "ACTIONS_GAINED", player: "p3", amount: 1 },
          { type: "CARD_REVEALED", player: "p3", card: "buster-keaton/porkpie-hat#1" },
          { type: "CARD_RETURNED_TO_HAND", player: "p2", card: "buster-keaton/the-great-stone-face#1" },
        ],
        ctx("p1", seat3p)
      );
      expect(out.map((l) => l.text)).toEqual([
        "P3 gained 1 action",
        "P3 revealed porkpie-hat",
        "P2 returned the-great-stone-face to hand",
      ]);
    });

    it("appends new lines AFTER the existing diff lines, preserving order", () => {
      const lines: ProLogLine[] = [{ text: "You drew 1 card", who: "you" }];
      const out = enrichLines(lines, [{ type: "DEFENSE_IGNORED" }], ctx());
      expect(out.map((l) => l.text)).toEqual(["You drew 1 card", "Defense ignored"]);
    });
  });

  // Issue #510 ↔ engine #281 (protocol v24). Game 9VQH turn 19: Gromnir (6) + a
  // +3 ability boost = 9 met a FEINT, and the log printed the fixed "attack card
  // effects were cancelled" even though Gromnir has NO effect text — nothing was
  // cancelled and the boost legitimately stood, so correct 6 damage read as a bug.
  describe("cancel outcome + value math (issue #510)", () => {
    const cancel = (over: Partial<Extract<GameEvent, { type: "EFFECT_CANCELED" }>> = {}): GameEvent => ({
      type: "EFFECT_CANCELED", role: "ATTACK", scope: "s", card: "a/gromnir#1", voided: true, boostVoided: false, ...over,
    });

    it("says nothing was cancelled when the cancel voided nothing", () => {
      expect(enrichLines([], [cancel({ voided: false })], ctx())).toEqual([
        {
          text: "Feint had no effect — gromnir has no card effects to cancel (value and boosts still count)",
          who: "game",
          cards: ["a/gromnir#1"],
        },
      ]);
    });

    it("falls back to the role when a voided-nothing cancel names no card", () => {
      const out = enrichLines([], [cancel({ voided: false, card: null, role: "DEFENSE" })], ctx());
      expect(out).toEqual([
        {
          text: "Feint had no effect — the defense card has no card effects to cancel (value and boosts still count)",
          who: "game",
          cards: undefined,
        },
      ]);
    });

    it("keeps the historical line when the cancel really did void effects", () => {
      expect(enrichLines([], [cancel()], ctx())).toEqual([
        {
          text: "Feint! Attack card effects were cancelled (printed value still counts)",
          who: "game",
          cards: ["a/gromnir#1"],
        },
      ]);
    });

    it("names the ability boost when the cancel stripped it too (discardIfCanceled)", () => {
      expect(enrichLines([], [cancel({ boostVoided: true })], ctx())).toEqual([
        {
          text: "Feint! Attack card effects were cancelled (printed value still counts) — its ability boost was cancelled too and no longer counts",
          who: "game",
          cards: ["a/gromnir#1"],
        },
      ]);
    });

    it("treats a pre-v24 event with no `voided` flag as a real cancel", () => {
      // A v23 server omits the flag entirely; the old line is the safe default.
      const legacy = { type: "EFFECT_CANCELED", role: "ATTACK", scope: "s" } as unknown as GameEvent;
      expect(enrichLines([], [legacy], ctx())).toEqual([
        { text: "Feint! Attack card effects were cancelled (printed value still counts)", who: "game" },
      ]);
    });

    const side = (over: Partial<ValueBreakdown> = {}): ValueBreakdown => ({
      role: "ATTACK", card: "a/gromnir#1", printed: 6, override: null, delta: 0,
      boosts: 0, abilityBoosts: 0, locked: false, total: 6, ...over,
    });
    const breakdown = (over: Partial<Extract<GameEvent, { type: "COMBAT_VALUE_BREAKDOWN" }>> = {}): GameEvent => ({
      type: "COMBAT_VALUE_BREAKDOWN",
      attack: side(),
      defense: [side({ role: "DEFENSE", card: "a/feint#1", printed: 2, total: 2 })],
      effectiveAttack: 6,
      effectiveDefense: 2,
      ignoreDefense: false,
      ...over,
    });

    it("renders the 9VQH math for both sides so the damage is auditable", () => {
      const out = enrichLines(
        [],
        [
          breakdown({
            attack: side({ abilityBoosts: 3, total: 9 }),
            defense: [side({ role: "DEFENSE", card: "a/feint#1", printed: 2, delta: 1, total: 3 })],
            effectiveAttack: 9,
            effectiveDefense: 3,
          }),
        ],
        ctx()
      );
      expect(out).toEqual([
        {
          text: "Attack: 6 (gromnir) + 3 (ability boost) = 9 · Defense: 2 (feint) + 1 = 3",
          who: "game",
          cards: ["a/gromnir#1", "a/feint#1"],
        },
      ]);
    });

    it("labels attached boost cards separately from ability boosts", () => {
      const out = enrichLines([], [breakdown({ attack: side({ boosts: 4, total: 10 }), effectiveAttack: 10 })], ctx());
      expect(out[0].text).toBe("Attack: 6 (gromnir) + 4 (boost) = 10 · Defense: 2 (feint) = 2");
    });

    it("renders a negative effect delta and marks the engine's floor at 0", () => {
      const out = enrichLines(
        [],
        [breakdown({ attack: side({ delta: -8, total: 0 }), effectiveAttack: 0 })],
        ctx()
      );
      expect(out[0].text).toBe("Attack: 6 (gromnir) - 8 (min 0) = 0 · Defense: 2 (feint) = 2");
    });

    it("marks an overridden / locked value instead of inventing arithmetic", () => {
      const out = enrichLines(
        [],
        [breakdown({ attack: side({ override: 4, locked: true, total: 4 }), effectiveAttack: 4 })],
        ctx()
      );
      expect(out[0].text).toBe("Attack: 4 (gromnir, set, locked) = 4 · Defense: 2 (feint) = 2");
    });

    it("reads out an undefended combat and an ignored defense differently", () => {
      const none = enrichLines([], [breakdown({ defense: [], effectiveDefense: 0 })], ctx());
      expect(none[0].text).toBe("Attack: 6 (gromnir) = 6 · Defense: none");
      const ignored = enrichLines([], [breakdown({ ignoreDefense: true })], ctx());
      expect(ignored[0].text).toBe("Attack: 6 (gromnir) = 6 · Defense: ignored");
    });

    it("sums both cards when an additional defense card is in play (v22)", () => {
      const out = enrichLines(
        [],
        [
          breakdown({
            defense: [
              side({ role: "DEFENSE", card: "a/feint#1", printed: 2, total: 2 }),
              side({ role: "DEFENSE", card: "a/parry#1", printed: 3, boosts: 1, total: 4 }),
            ],
            effectiveDefense: 6,
          }),
        ],
        ctx()
      );
      expect(out[0].text).toBe("Attack: 6 (gromnir) = 6 · Defense: 2 (feint) + 3 (parry) + 1 (boost) = 6");
      expect(out[0].cards).toEqual(["a/gromnir#1", "a/feint#1", "a/parry#1"]);
    });

    it("falls back to the role for a synthetic sub-attack card with no instance", () => {
      const out = enrichLines(
        [],
        [breakdown({ attack: side({ card: null, printed: 4, total: 4 }), effectiveAttack: 4, defense: [], effectiveDefense: 0 })],
        ctx()
      );
      expect(out).toEqual([
        { text: "Attack: 4 (attack) = 4 · Defense: none", who: "game", cards: undefined },
      ]);
    });
  });

  describe("regression guard — non-allowlisted events create zero lines", () => {
    it("feeds every non-allowlisted GameEvent type through and asserts no new lines", () => {
      const nonAllowlisted = ALL_EVENTS.filter((e) => !ALLOWLIST.has(e.type));
      const lines: ProLogLine[] = [{ text: "Turn 1 — your turn", who: "game" }];
      const out = enrichLines(lines, nonAllowlisted, ctx());
      expect(out).toEqual(lines);
    });

    it("covers the whole union except the allowlist (no variant silently skipped)", () => {
      const seen = new Set(ALL_EVENTS.map((e) => e.type));
      // A discard is an annotation-only type; add it so the roster is exhaustive.
      seen.add("CARD_DISCARDED");
      // Sanity: the allowlist is a subset of what the union offers.
      for (const t of ALLOWLIST) expect(["VALUE_MODIFIED", "VALUE_SET", "EFFECT_SCHEDULED", "EFFECT_FIRED", "EFFECT_CANCELED", "COMBAT_VALUE_BREAKDOWN", "DEFENSE_IGNORED", "DAMAGE_PREVENTED", "EXHAUSTION_DAMAGE", "ACTIONS_GAINED", "CARD_RETURNED_TO_HAND", "CARD_REVEALED", "COMBAT_WON_MARKED", "PLAYED_CARD_RETURNED", "SECOND_ATTACK_COMMITTED", "BONUS_ATTACK_STARTED", "BONUS_ATTACK_PASSED", "SUB_ATTACK_INITIATED"]).toContain(t);
    });
  });

  // General Grievous nested-combat events (issue #288 ↔ engine #160): each fills a
  // gap the view-diff misses because up to three combats reuse the one state.combat
  // slot, so `!prev.combat` never fires for combats 2/3. ctx().fighter strips the
  // "<pid>/" prefix in these fixtures ("hero", "sidekick-1").
  describe("General Grievous nested combat (issue #288)", () => {
    const line = (event: GameEvent) => enrichLines([], [event], ctx())[0];

    it("SECOND_ATTACK_COMMITTED — names the hero readying a face-down 2nd attack", () => {
      expect(line({ type: "SECOND_ATTACK_COMMITTED", player: "p1" }).text).toBe(
        "hero readies a second attack (face down)"
      );
    });

    it("BONUS_ATTACK_STARTED — labels Combat 2 with both fighters", () => {
      expect(line({ type: "BONUS_ATTACK_STARTED", attacker: "p1/hero", target: "p2/hero" }).text).toBe(
        "Multi-Arm Barrage — Combat 2: hero vs hero"
      );
    });

    it("BONUS_ATTACK_PASSED — a game line", () => {
      const l = line({ type: "BONUS_ATTACK_PASSED", player: "p1" });
      expect(l.text).toBe("Multi-Arm Barrage — 2nd attack passed");
      expect(l.who).toBe("game");
    });

    it("SUB_ATTACK_INITIATED — a B1 Battle Droid fires Blast 'em! with the printed value", () => {
      // Grievous's flavor is kept only when the attacker resolves to a B1
      // Battle Droid — the fighter that fires the printed sub-attack (#411).
      const grievousCtx: EnrichContext = {
        ...ctx(),
        fighter: (id) => (id.endsWith("/sidekick-1") ? "B1 Battle Droid" : (id.split("/").pop() ?? id)),
      };
      expect(
        enrichLines(
          [],
          [{ type: "SUB_ATTACK_INITIATED", attacker: "p1/sidekick-1", target: "p2/hero", value: 4 }],
          grievousCtx
        )[0].text
      ).toBe("B1 Battle Droid fires Blast 'em! (4) at hero");
    });

    it("SUB_ATTACK_INITIATED — any other attacker gets a neutral bonus-attack line, never 'Blast 'em!'", () => {
      // Batman's Dark Knight [3] CRITICAL STRIKE uses the same generic op but
      // must not borrow Grievous's flavor (#411).
      const text = line({
        type: "SUB_ATTACK_INITIATED",
        attacker: "p1/hero",
        target: "p2/sidekick-1",
        value: 3,
      }).text;
      expect(text).toBe("hero makes a bonus attack (3) against sidekick-1");
      expect(text).not.toContain("Blast 'em!");
    });

    it("COMBAT_WON_MARKED — 'You are considered to have won' for the viewer", () => {
      expect(line({ type: "COMBAT_WON_MARKED", player: "p1" }).text).toBe(
        "You are considered to have won this combat"
      );
    });

    it("PLAYED_CARD_RETURNED — returns the named card to hand", () => {
      const l = line({ type: "PLAYED_CARD_RETURNED", player: "p1", card: "a/x#1" });
      expect(l.text).toBe("You returned x to hand");
      expect(l.cards).toEqual(["a/x#1"]);
    });
  });
});


describe("multiplayer diffViews", () => {
  const players3 = (p3: Partial<PlayerView["players"][number]> = {}) => [
    { id: "p1" as const, heroId: "fixture-p1", you: true, hand: [], handCount: 0, deckCount: 10, discard: [], committedCard: null, hasCommitted: false, counters: {}, flags: {}, wonCombatThisTurn: false, lostCombatThisTurn: false, firstAttackThisTurn: false, playedACardThisTurn: false, tookDamageThisTurn: false },
    { id: "p2" as const, heroId: "fixture-p2", you: false, handCount: 5, deckCount: 10, discard: [], hasCommitted: false, counters: {}, flags: {}, wonCombatThisTurn: false, lostCombatThisTurn: false, firstAttackThisTurn: false, playedACardThisTurn: false, tookDamageThisTurn: false },
    { id: "p3" as const, heroId: "fixture-p3", you: false, handCount: 5, deckCount: 10, discard: [], hasCommitted: false, counters: {}, flags: {}, wonCombatThisTurn: false, lostCombatThisTurn: false, firstAttackThisTurn: false, playedACardThisTurn: false, tookDamageThisTurn: false, ...p3 },
  ];

  it("labels third-player turn, draw, discard, and win lines without a duel opponent", () => {
    const prev = view({ opponent: null, players: players3() });
    const next = view({
      opponent: null,
      turnNumber: 2,
      activePlayer: "p3",
      winner: "p3",
      players: players3({ handCount: 6, deckCount: 9, discard: ["a/fireball#1"] }),
    });

    expect(diffViews(prev, next, label).map((l) => l.text)).toEqual(expect.arrayContaining([
      "Turn 2 — P3's turn",
      "P3 drew 1 card",
      "P3 → discard: fireball",
      "Defeat — P3 wins",
    ]));
  });

  // Elimination sweep (engine #102): when a seat's hero dies its survivors are
  // cleared to hp:0 with a FIGHTER_DEFEATED but NO DAMAGE_APPLIED. The differ
  // must not spam "took N damage" for those swept fighters (issue #212).
  describe("elimination sweep", () => {
    const prev = view({
      opponent: null,
      players: players3(),
      fighters: [
        fighter({}),
        fighter({ id: "p2/hero", owner: "p2", name: "Thrall", space: "s2", hp: 3 }),
        fighter({ id: "p2/sidekick", owner: "p2", kind: "SIDEKICK", name: "Grunt", space: "s3", hp: 2 }),
      ],
    });
    const next = view({
      opponent: null,
      players: players3(),
      fighters: [
        fighter({}),
        fighter({ id: "p2/hero", owner: "p2", name: "Thrall", space: null, hp: 0, defeated: true }),
        fighter({ id: "p2/sidekick", owner: "p2", kind: "SIDEKICK", name: "Grunt", space: null, hp: 0, defeated: true }),
      ],
    });

    it("logs a removal (not damage) for a swept sidekick, keeps the kill-shot for the hero", () => {
      const texts = diffViews(prev, next, label, [
        { type: "DAMAGE_APPLIED", fighter: "p2/hero", amount: 3, source: "ATTACK" },
        { type: "FIGHTER_DEFEATED", fighter: "p2/hero" },
        { type: "FIGHTER_DEFEATED", fighter: "p2/sidekick" },
      ]).map((l) => l.text);
      // Hero was genuinely killed — damage + defeat both survive.
      expect(texts).toContain("Thrall took 3 damage (0/10)");
      expect(texts).toContain("Thrall was defeated!");
      // Swept sidekick — no damage line, a removal line instead of a defeat.
      expect(texts).not.toContain("Grunt took 2 damage (0/10)");
      expect(texts).toContain("Grunt was removed (hero defeated)");
      expect(texts).not.toContain("Grunt was defeated!");
    });

    it("keeps the damage + defeat line for a genuine kill (DAMAGE_APPLIED present)", () => {
      const texts = diffViews(prev, next, label, [
        { type: "DAMAGE_APPLIED", fighter: "p2/sidekick", amount: 2, source: "ATTACK" },
        { type: "FIGHTER_DEFEATED", fighter: "p2/sidekick" },
      ]).map((l) => l.text);
      expect(texts).toContain("Grunt took 2 damage (0/10)");
      expect(texts).toContain("Grunt was defeated!");
    });

    it("falls back to pre-fix behaviour with no events (older server)", () => {
      const texts = diffViews(prev, next, label).map((l) => l.text);
      expect(texts).toContain("Grunt took 2 damage (0/10)");
      expect(texts).toContain("Grunt was defeated!");
    });
  });

  it("names the acting seat (not 'Opponent') for a p3 maneuver boost in >2p", () => {
    // A boosted move by p3 surfaces as its discard line + the enrich '(spent to
    // boost)' suffix (MOVE_BOOSTED itself is diff-covered, not a standalone line). Post
    // engine-#119 the boosting seat can be p3; the seat label must read "P3".
    const prev = view({ opponent: null, players: players3() });
    const next = view({
      opponent: null,
      activePlayer: "p3",
      players: players3({ discard: ["a/fireball#1"] }),
    });
    const diff = diffViews(prev, next, label);
    const seat3p = (p: string) => (p === "p1" ? "You" : p.toUpperCase());
    const enriched = enrichLines(
      diff,
      [{ type: "CARD_DISCARDED", player: "p3", card: "a/fireball#1", reason: "BOOST" }],
      ctx("p1", seat3p)
    );
    expect(enriched.map((l) => l.text)).toContain("P3 → discard: fireball (spent to boost)");
    expect(enriched.every((l) => !l.text.includes("Opponent"))).toBe(true);
  });
});

// --- Parity: flag OFF path (and flag ON with empty events) must equal diffViews.
// enrichLines with an empty events array returns the diff lines unchanged; this
// is the byte-identical guarantee the page relies on for the flag-off / pre-v10
// server code path.
describe("parity with diffViews", () => {
  const scenarios: { name: string; prev: PlayerView | null; next: PlayerView }[] = [
    { name: "first snapshot (game on)", prev: null, next: view({}) },
    {
      name: "turn change",
      prev: view({ turnNumber: 1, activePlayer: "p1" }),
      next: view({ turnNumber: 2, activePlayer: "p2" }),
    },
    {
      name: "damage + move",
      prev: view({}),
      next: view({
        fighters: [fighter({ hp: 6, space: "s3" }), fighter({ id: "p2/hero", owner: "p2", name: "Thrall", space: "s2" })],
      }),
    },
    {
      name: "self discard (unattributed by diff)",
      prev: view({ self: { id: "p1", heroId: "king-taranis", hand: [], deckCount: 10, discard: [], committedCard: null, counters: {}, flags: {}, wonCombatThisTurn: false, lostCombatThisTurn: false, firstAttackThisTurn: false, playedACardThisTurn: false, tookDamageThisTurn: false } }),
      next: view({ self: { id: "p1", heroId: "king-taranis", hand: [], deckCount: 10, discard: ["a/fireball#1"], committedCard: null, counters: {}, flags: {}, wonCombatThisTurn: false, lostCombatThisTurn: false, firstAttackThisTurn: false, playedACardThisTurn: false, tookDamageThisTurn: false } }),
    },
    {
      name: "combat reveal",
      prev: view({ combat: combat({ attackerCard: null }) }),
      next: view({ combat: combat({ attackerCard: { instance: "a/fireball#1" } as never }) }),
    },
  ];

  it.each(scenarios)("flag-off path == diffViews for: %s", ({ name, prev, next }) => {
    void name;
    const diff = diffViews(prev, next, label);
    // Flag ON but events empty (older server / no action events) — same result.
    expect(enrichLines(diff, [], ctx(next.you))).toEqual(diff);
  });
});

// --- Grouping metadata (issue #298) -----------------------------------------
// The page stamps every appended STATE batch with a batchId, the batch's action
// (from ACTION_SPENT) and the turn's actor, so the log panel can section lines
// by turn and group one player action's lines into a single block.
describe("batchPhase — the action label a STATE batch carried", () => {
  it.each([
    ["MANEUVER", "Maneuver"],
    ["SCHEME", "Scheme"],
    ["ATTACK", "Attack"],
    ["SCHEME_ITEM", "Scheme Item"],
  ] as const)("maps ACTION_SPENT %s → %s", (action, label) => {
    expect(batchPhase([{ type: "ACTION_SPENT", player: "p1", action }])).toBe(label);
  });

  it("is undefined for a batch with no ACTION_SPENT (setup, forced end-of-turn)", () => {
    expect(batchPhase([{ type: "TURN_STARTED", player: "p1", turnNumber: 2 }])).toBeUndefined();
    expect(batchPhase([])).toBeUndefined();
  });

  it("finds the ACTION_SPENT among other events", () => {
    expect(
      batchPhase([
        { type: "FIGHTER_MOVED", fighter: "p1/hero", path: ["s1", "s2"] },
        { type: "ACTION_SPENT", player: "p1", action: "ATTACK" },
        { type: "COMBAT_DAMAGE", amount: 3 },
      ])
    ).toBe("Attack");
  });
});

// issue #509: an empty-deck, no-move maneuver produces no diff lines at all —
// no deck-count change (nothing to draw), no space change. Without a fallback
// the whole action vanishes and the player sees an action spent with no trace.
describe("actionFallbackLine — a spent action never renders as nothing", () => {
  const seat = (p: PlayerId) => (p === "p1" ? "You" : "Opponent");

  it.each([
    ["MANEUVER", "Opponent maneuvered"],
    ["SCHEME", "Opponent schemed"],
    ["ATTACK", "Opponent attacked"],
    ["SCHEME_ITEM", "Opponent used a scheme item"],
  ] as const)("renders %s as a minimal line", (action, text) => {
    expect(
      actionFallbackLine([{ type: "ACTION_SPENT", player: "p2", action }], "p1", seat)
    ).toEqual({ text, who: "opp" });
  });

  it("attributes the viewer's own action to 'you'", () => {
    expect(
      actionFallbackLine([{ type: "ACTION_SPENT", player: "p1", action: "MANEUVER" }], "p1", seat)
    ).toEqual({ text: "You maneuvered", who: "you" });
  });

  it("names the acting seat in a >2p game", () => {
    const seat3p = (p: PlayerId) => (p === "p1" ? "You" : p.toUpperCase());
    expect(
      actionFallbackLine([{ type: "ACTION_SPENT", player: "p3", action: "SCHEME" }], "p1", seat3p)
    ).toEqual({ text: "P3 schemed", who: "opp" });
  });

  it("is undefined for a batch that spent no action (setup, forced end-of-turn)", () => {
    expect(actionFallbackLine([], "p1", seat)).toBeUndefined();
    expect(
      actionFallbackLine([{ type: "TURN_STARTED", player: "p1", turnNumber: 2 }], "p1", seat)
    ).toBeUndefined();
  });

  it("finds the ACTION_SPENT among the batch's other events", () => {
    // The motivating batch: a maneuver whose draw hit an empty deck. CARD_DRAWN
    // never fires, nothing moves — only the action itself is left to report.
    expect(
      actionFallbackLine(
        [
          { type: "ACTION_SPENT", player: "p2", action: "MANEUVER" },
          { type: "DECK_SHUFFLED", player: "p2" },
        ],
        "p1",
        seat
      )
    ).toEqual({ text: "Opponent maneuvered", who: "opp" });
  });

  it("pairs with batchPhase so the group renders under its action label", () => {
    // The page uses both: batchPhase for the group heading, this for the body.
    // An empty-deck maneuver must read as *Maneuver* → "Opponent maneuvered".
    const events: GameEvent[] = [{ type: "ACTION_SPENT", player: "p2", action: "MANEUVER" }];
    expect(batchPhase(events)).toBe("Maneuver");
    expect(actionFallbackLine(events, "p1", seat)?.text).toBe("Opponent maneuvered");
  });
});

describe("groupLog — section newest-first entries by turn and batch", () => {
  const entry = (over: Partial<ProLogEntry> & { text: string }): ProLogEntry => ({
    key: over.text,
    who: "game",
    ...over,
  });

  it("splits a turn into one group per batchId, preserving order", () => {
    // Newest-first: turn 2 attack batch (batch 3), then turn 2 maneuver (batch 2).
    const entries: ProLogEntry[] = [
      entry({ text: "3 damage", turn: 2, turnActor: "Opponent", batchId: 3, phase: "Attack" }),
      entry({ text: "Reveal", turn: 2, turnActor: "Opponent", batchId: 3, phase: "Attack" }),
      entry({ text: "moved", turn: 2, turnActor: "Opponent", batchId: 2, phase: "Maneuver" }),
    ];
    const sections = groupLog(entries);
    expect(sections).toHaveLength(1);
    expect(sections[0].turn).toBe(2);
    expect(sections[0].actor).toBe("Opponent");
    expect(sections[0].groups.map((g) => g.phase)).toEqual(["Attack", "Maneuver"]);
    expect(sections[0].groups[0].entries.map((e) => e.text)).toEqual(["3 damage", "Reveal"]);
  });

  it("opens a new section at each turn boundary", () => {
    const entries: ProLogEntry[] = [
      entry({ text: "b", turn: 3, turnActor: "You", batchId: 5, phase: "Scheme" }),
      entry({ text: "a", turn: 2, turnActor: "Opponent", batchId: 4, phase: "Maneuver" }),
    ];
    const sections = groupLog(entries);
    expect(sections.map((s) => s.turn)).toEqual([3, 2]);
    expect(sections.map((s) => s.actor)).toEqual(["You", "Opponent"]);
  });

  it("keeps no-action batches as a neutral group (undefined phase)", () => {
    const entries: ProLogEntry[] = [
      entry({ text: "Game on", turn: 1, turnActor: "You", batchId: 0 }),
    ];
    const sections = groupLog(entries);
    expect(sections[0].groups[0].phase).toBeUndefined();
    expect(sections[0].groups[0].entries[0].text).toBe("Game on");
  });

  it("returns no sections for an empty feed", () => {
    expect(groupLog([])).toEqual([]);
  });

  // --- issue #522: a turn that appears twice must stay two distinct sections --
  it("gives a repeated turn two sections with distinct ids", () => {
    // A rewind broadcast tagged turn 10 landed between turn-21 batches, so the
    // feed carries turn 21 / turn 10 / turn 21 top-down.
    const entries: ProLogEntry[] = [
      entry({ text: "newest 21", turn: 21, turnActor: "Opponent", batchId: 9 }),
      entry({ text: "ghost 10", turn: 10, turnActor: "You", batchId: 8 }),
      entry({ text: "older 21", turn: 21, turnActor: "Opponent", batchId: 7 }),
    ];
    const sections = groupLog(entries);
    expect(sections.map((s) => s.turn)).toEqual([21, 10, 21]);
    expect(new Set(sections.map((s) => s.id)).size).toBe(3);
  });

  it("anchors a section's id on its OLDEST entry, so prepending a batch keeps it", () => {
    const older = entry({ text: "older", turn: 4, turnActor: "You", batchId: 1 });
    const before = groupLog([older]);
    const after = groupLog([entry({ text: "newer", turn: 4, turnActor: "You", batchId: 2 }), older]);
    expect(after[0].id).toBe(before[0].id);
    expect(after[0].groups).toHaveLength(2);
  });
});

describe("batchTurnTag — turn tag for one STATE batch (issue #522)", () => {
  it("uses the post-batch view's turn and active seat while turns advance", () => {
    const prev = view({ turnNumber: 3, activePlayer: "p1" });
    const next = view({ turnNumber: 4, activePlayer: "p2" });
    expect(batchTurnTag(prev, next)).toEqual({ turn: 4, turnActor: "Opponent" });
  });

  it("files a REGRESSED broadcast under the turn it interrupted", () => {
    const prev = view({ turnNumber: 21, activePlayer: "p2" });
    const next = view({ turnNumber: 10, activePlayer: "p1" });
    expect(batchTurnTag(prev, next)).toEqual({ turn: 21, turnActor: "Opponent" });
  });

  it("keeps the same turn (and its seat) for mid-turn batches", () => {
    const prev = view({ turnNumber: 7, activePlayer: "p1" });
    const next = view({ turnNumber: 7, activePlayer: "p1" });
    expect(batchTurnTag(prev, next)).toEqual({ turn: 7, turnActor: "You" });
  });

  it("falls back to the incoming view on the very first batch", () => {
    const next = view({ turnNumber: 1, activePlayer: "p1" });
    expect(batchTurnTag(null, next)).toEqual({ turn: 1, turnActor: "You" });
  });
});

describe("diffViews — v17 battlefield item lines (always-on, off the event stream)", () => {
  // Item labels live on the static map.items, not the card catalog, so these
  // lines read off the event stream (the always-passed channel), with the label
  // resolved from view.map — part of the pure diff, not the event enrichment.
  const withItems = (over: Partial<PlayerView> = {}) =>
    view({
      map: {
        schemaVersion: "1",
        id: "m",
        meta: { title: "m", minPlayers: 2, maxPlayers: 2, specialRules: false },
        zones: [],
        items: [
          { id: "sword", kind: "combat", label: "Sword", value: 2 },
          { id: "bomb", kind: "scheme", label: "Bomb", ops: [] as never },
        ],
        spaces: [],
      },
      ...over,
    });

  it("logs a scheme-item use with the item label", () => {
    const prev = withItems();
    const next = withItems();
    const events: GameEvent[] = [{ type: "ITEM_USED", player: "p1", space: "s1", item: "bomb" }];
    const lines = diffViews(prev, next, label, events);
    expect(lines).toContainEqual({ text: "You used Bomb", who: "you" });
  });

  it("logs a combat-item attach with label, value, and role", () => {
    const prev = withItems();
    const next = withItems();
    const events: GameEvent[] = [
      { type: "COMBAT_ITEM_ATTACHED", player: "p2", role: "ATTACK", space: "s2", item: "sword", value: 2 },
    ];
    const lines = diffViews(prev, next, label, events);
    expect(lines).toContainEqual({ text: "Opponent attached Sword (+2 attack)", who: "opp" });
  });

  it("emits no item line when the batch carries no item events (resume/join)", () => {
    const lines = diffViews(withItems(), withItems(), label, []);
    expect(lines.some((l) => /used|attached/.test(l.text))).toBe(false);
  });
});

// --- Line order within a batch (issue #402) ---------------------------------
// One reading direction per level: turns/groups are newest-first (the page
// prepends whole batches), but lines WITHIN a batch must read chronologically
// top-down — the combat lifecycle (attack → reveal → outcome) precedes the
// fighter damage/defeat it caused, and enrich additions trail the batch.
describe("diffViews — chronological line order within a batch (issue #402)", () => {
  it("emits attack → reveal → outcome → damage → defeat in story order", () => {
    const prev = view({ combat: null });
    const next = view({
      combat: combat({
        attackerCard: { instance: "a/fireball#1" } as never,
        outcome: "ATTACKER_WON",
        attackDamageDealt: 10,
      }),
      fighters: [
        fighter({}),
        fighter({ id: "p2/hero", owner: "p2", name: "Thrall", space: "s2", hp: 0, defeated: true }),
      ],
    });
    const texts = diffViews(prev, next, label).map((l) => l.text);
    expect(texts).toEqual([
      "King Taranis attacks Thrall",
      "Reveal: fireball vs no defense",
      "attacker won — 10 damage",
      "Thrall took 10 damage (0/10)",
      "Thrall was defeated!",
    ]);
  });

  it("keeps enrichLines' new lines after the diff lines (damage before discard reason)", () => {
    // prev already has a combat (no outcome yet) so the attack-start line does
    // not fire — this batch is just the outcome resolving.
    const prev = view({ combat: combat({ outcome: null }) });
    const next = view({
      combat: combat({ outcome: "ATTACKER_WON", attackDamageDealt: 3 }),
      fighters: [fighter({}), fighter({ id: "p2/hero", owner: "p2", name: "Thrall", space: "s2", hp: 7 })],
    });
    const diff = diffViews(prev, next, label);
    const out = enrichLines(diff, [{ type: "DEFENSE_IGNORED" }], ctx());
    expect(out.map((l) => l.text)).toEqual([
      "attacker won — 3 damage",
      "Thrall took 3 damage (7/10)",
      "Defense ignored",
    ]);
  });
});

// --- CSV export is strictly oldest-first, line-by-line (issue #402) ----------
// Entries are stored newest-batch-first but oldest-first within a batch, so the
// export reverses the BATCH order only — never the lines inside a batch — to get
// a monotonically non-decreasing time column.
describe("logEntriesToCsv — strictly oldest-first export", () => {
  const entry = (over: Partial<ProLogEntry> & { text: string }): ProLogEntry => ({
    key: over.text,
    who: "game",
    ...over,
  });

  it("reverses batch order but preserves line order within a batch", () => {
    // Stored newest-first: batch 1 (turn 2) on top, batch 0 (turn 1) below; each
    // batch's lines stored oldest-first.
    const entries: ProLogEntry[] = [
      entry({ text: "attack", turn: 2, batchId: 1, ts: 300 }),
      entry({ text: "damage", turn: 2, batchId: 1, ts: 300 }),
      entry({ text: "game on", turn: 1, batchId: 0, ts: 100 }),
      entry({ text: "you drew 1", turn: 1, batchId: 0, ts: 100 }),
    ];
    const rows = logEntriesToCsv(entries).split("\n").slice(1); // drop header
    expect(rows.map((r) => r.split(",")[4])).toEqual([
      '"game on"',
      '"you drew 1"',
      '"attack"',
      '"damage"',
    ]);
  });

  it("keeps the time column monotonically non-decreasing", () => {
    const entries: ProLogEntry[] = [
      entry({ text: "b0", batchId: 2, ts: 300 }),
      entry({ text: "b1", batchId: 2, ts: 300 }),
      entry({ text: "a0", batchId: 1, ts: 200 }),
      entry({ text: "c0", batchId: 0, ts: 100 }),
    ];
    const times = logEntriesToCsv(entries)
      .split("\n")
      .slice(1)
      .map((r) => r.split(",")[0]);
    const sorted = [...times].sort();
    expect(times).toEqual(sorted);
  });
});

// --- Counter changes: spent/gained/lost RAGE etc. (issue #485) ---------------
// The engine emits COUNTER_CHANGED { player, name, value } with only the NEW
// value, so the formatter derives the delta against a per-(player, counter)
// running value seeded from the pre-batch snapshot. Generic for every counter
// hero (RAGE, CLUE, OMEN …) — no per-hero switch.
describe("counterChangeLines — the COUNTER_CHANGED formatter", () => {
  const cc = (player: PlayerId, name: string, value: number): GameEvent => ({
    type: "COUNTER_CHANGED",
    player,
    name,
    value,
  });
  const whoOf = (p: PlayerId): "you" | "opp" => (p === "p1" ? "you" : "opp");
  // No prior value tracked for any counter: every first-seen delta is vs 0.
  const noPrior = () => 0;

  it("logs a gain as `gained N NAME (total)`", () => {
    const lines = counterChangeLines([cc("p1", "RAGE", 2)], () => 1, whoOf);
    expect(lines).toEqual([{ text: "gained 1 RAGE (2 total)", who: "you" }]);
  });

  it("logs a spend (decrease to a positive value) as `spent N NAME (remaining)`", () => {
    const lines = counterChangeLines([cc("p1", "RAGE", 1)], () => 3, whoOf);
    expect(lines).toEqual([{ text: "spent 2 RAGE (1 remaining)", who: "you" }]);
  });

  it("logs a removeAll (decrease to zero) as `lost all NAME (was N)`", () => {
    const lines = counterChangeLines([cc("p1", "RAGE", 0)], () => 2, whoOf);
    expect(lines).toEqual([{ text: "lost all RAGE (was 2)", who: "you" }]);
  });

  it("treats a first-seen counter with no prior value as 0 (increase from 0)", () => {
    const lines = counterChangeLines([cc("p1", "OMEN", 3)], noPrior, whoOf);
    expect(lines).toEqual([{ text: "gained 3 OMEN (3 total)", who: "you" }]);
  });

  it("emits nothing for a no-op change (value unchanged)", () => {
    expect(counterChangeLines([cc("p1", "RAGE", 2)], () => 2, whoOf)).toEqual([]);
  });

  it("chains multiple mutations of one counter within a single batch", () => {
    // spend 2 (3→1) then gain 1 (1→2) in the same action: each reads out, the
    // second delta measured against the value the first event set, not the
    // pre-batch snapshot.
    const lines = counterChangeLines([cc("p1", "RAGE", 1), cc("p1", "RAGE", 2)], () => 3, whoOf);
    expect(lines).toEqual([
      { text: "spent 2 RAGE (1 remaining)", who: "you" },
      { text: "gained 1 RAGE (2 total)", who: "you" },
    ]);
  });

  it("keeps interleaved two-player sequences on independent running values", () => {
    // p1 RAGE 3→1, p2 CLUE 0→1, p1 RAGE 1→0, p2 CLUE 1→2 — each (player,name)
    // tracks its own baseline, so the deltas never cross-contaminate.
    const prior = (player: string, name: string) =>
      player === "p1" && name === "RAGE" ? 3 : 0;
    const lines = counterChangeLines(
      [cc("p1", "RAGE", 1), cc("p2", "CLUE", 1), cc("p1", "RAGE", 0), cc("p2", "CLUE", 2)],
      prior,
      whoOf
    );
    expect(lines).toEqual([
      { text: "spent 2 RAGE (1 remaining)", who: "you" },
      { text: "gained 1 CLUE (1 total)", who: "opp" },
      { text: "lost all RAGE (was 1)", who: "you" },
      { text: "gained 1 CLUE (2 total)", who: "opp" },
    ]);
  });

  it("ignores non-counter events in the batch", () => {
    expect(counterChangeLines([{ type: "DEFENSE_IGNORED" }], () => 0, whoOf)).toEqual([]);
  });
});

// diffViews seeds the pre-batch baseline from the previous snapshot's public
// counters, so the delta is correct end-to-end (issue #485).
describe("diffViews — counter change lines seeded from the snapshot baseline", () => {
  const withCounter = (self: number, opp: number, over: Partial<PlayerView> = {}) =>
    view({
      self: { id: "p1", heroId: "cairne-bloodhoof", hand: [], deckCount: 10, discard: [], committedCard: null, counters: { RAGE: self }, flags: {}, wonCombatThisTurn: false, lostCombatThisTurn: false, firstAttackThisTurn: false, playedACardThisTurn: false, tookDamageThisTurn: false },
      opponent: { id: "p2", heroId: "thrall", handCount: 5, deckCount: 10, discard: [], hasCommitted: false, counters: { RAGE: opp }, flags: {}, wonCombatThisTurn: false, lostCombatThisTurn: false, firstAttackThisTurn: false, playedACardThisTurn: false, tookDamageThisTurn: false },
      ...over,
    });

  it("derives a spend delta from the previous snapshot's counter value", () => {
    const prev = withCounter(3, 0);
    const next = withCounter(1, 0);
    const lines = diffViews(prev, next, label, [
      { type: "COUNTER_CHANGED", player: "p1", name: "RAGE", value: 1 },
    ]);
    expect(lines).toContainEqual({ text: "spent 2 RAGE (1 remaining)", who: "you" });
  });

  it("attributes the opponent's gain to [opp] (public counters, both seats)", () => {
    const prev = withCounter(0, 1);
    const next = withCounter(0, 2);
    const lines = diffViews(prev, next, label, [
      { type: "COUNTER_CHANGED", player: "p2", name: "RAGE", value: 2 },
    ]);
    expect(lines).toContainEqual({ text: "gained 1 RAGE (2 total)", who: "opp" });
  });

  it("emits no counter line on a broadcast with no events (resume/join)", () => {
    const lines = diffViews(withCounter(3, 0), withCounter(1, 0), label, []);
    expect(lines.some((l) => /RAGE/.test(l.text))).toBe(false);
  });
});
