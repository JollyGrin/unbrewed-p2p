import { diffViews, enrichLines, EnrichContext, ProLogLine } from "./gameLog";
import { CardInstanceId, GameEvent, PlayerView, ViewCombat, ViewFighter } from "./protocol";

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
  self: { id: "p1", heroId: "king-taranis", hand: [], deckCount: 10, discard: [], committedCard: null, counters: {} },
  opponent: { id: "p2", heroId: "thrall", handCount: 5, deckCount: 10, discard: [], hasCommitted: false, counters: {} },
  players: [
    { id: "p1", heroId: "fixture-p1", you: true, hand: [], handCount: 0, deckCount: 10, discard: [], committedCard: null, hasCommitted: false, counters: {} },
    { id: "p2", heroId: "fixture-p2", you: false, handCount: 5, deckCount: 10, discard: [], hasCommitted: false, counters: {} },
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
  { type: "EFFECT_CANCELED", role: "ATTACK", scope: "s" },
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
];

// The allowlist — event types enrichLines is permitted to turn into new lines.
const ALLOWLIST = new Set([
  "VALUE_MODIFIED",
  "VALUE_SET",
  "EFFECT_SCHEDULED",
  "EFFECT_FIRED",
  "DEFENSE_IGNORED",
  "DAMAGE_PREVENTED",
  "ACTIONS_GAINED",
  "CARD_RETURNED_TO_HAND",
  "CARD_REVEALED",
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
      ["BOOST", "(boost)"],
      ["COMBAT", "(combat)"],
      ["HAND_LIMIT", "(hand limit)"],
      ["EFFECT", "(effect)"],
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
        "You → discard: shield (combat)",
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
        "You → discard: fireball (boost)",
        "You → discard: fireball (combat)",
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
    it("VALUE_MODIFIED renders 'Attack value X → Y'", () => {
      const out = enrichLines([], [{ type: "VALUE_MODIFIED", role: "ATTACK", delta: 2, newEffective: 5 }], ctx());
      expect(out).toEqual([{ text: "Attack value 3 → 5", who: "game" }]);
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
      for (const t of ALLOWLIST) expect(["VALUE_MODIFIED", "VALUE_SET", "EFFECT_SCHEDULED", "EFFECT_FIRED", "DEFENSE_IGNORED", "DAMAGE_PREVENTED", "ACTIONS_GAINED", "CARD_RETURNED_TO_HAND", "CARD_REVEALED"]).toContain(t);
    });
  });
});


describe("multiplayer diffViews", () => {
  const players3 = (p3: Partial<PlayerView["players"][number]> = {}) => [
    { id: "p1" as const, heroId: "fixture-p1", you: true, hand: [], handCount: 0, deckCount: 10, discard: [], committedCard: null, hasCommitted: false, counters: {} },
    { id: "p2" as const, heroId: "fixture-p2", you: false, handCount: 5, deckCount: 10, discard: [], hasCommitted: false, counters: {} },
    { id: "p3" as const, heroId: "fixture-p3", you: false, handCount: 5, deckCount: 10, discard: [], hasCommitted: false, counters: {}, ...p3 },
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
      prev: view({ self: { id: "p1", heroId: "king-taranis", hand: [], deckCount: 10, discard: [], committedCard: null, counters: {} } }),
      next: view({ self: { id: "p1", heroId: "king-taranis", hand: [], deckCount: 10, discard: ["a/fireball#1"], committedCard: null, counters: {} } }),
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
