import { maneuverBoostHint } from "./maneuverHint";
import { Action, PlayerView, ViewFighter } from "./protocol";

const fighter = (over: Partial<ViewFighter>): ViewFighter => ({
  id: "p1/hero",
  owner: "p1",
  kind: "HERO",
  name: "Thrall",
  space: "s1",
  tailSpace: null,
  hp: 15,
  maxHp: 15,
  reach: "MELEE",
  defeated: false,
  ...over,
});

const view = (over: Partial<PlayerView>): PlayerView => ({
  you: "p1",
  phase: "PLAY",
  turnNumber: 3,
  activePlayer: "p1",
  actionsRemaining: 2,
  turnPhase: "MANEUVER_MOVE",
  maneuver: { boostApplied: 0, boosted: false, moved: [] },
  map: { schemaVersion: "1", id: "m", meta: { title: "m", minPlayers: 2, maxPlayers: 2, specialRules: false }, zones: [], spaces: [] },
  catalog: {},
  fighters: [fighter({}), fighter({ id: "p2/hero", owner: "p2", name: "The Mandalorian", space: "s2" })],
  tokens: [],
  self: { id: "p1", heroId: "thrall", hand: [], deckCount: 20, discard: [], committedCard: null, counters: {}, flags: {} },
  opponent: { id: "p2", heroId: "the-mandalorian", handCount: 5, deckCount: 20, discard: [], hasCommitted: false, counters: {}, flags: {} },
  players: [
    { id: "p1", heroId: "fixture-p1", you: true, hand: [], handCount: 0, deckCount: 10, discard: [], committedCard: null, hasCommitted: false, counters: {}, flags: {} },
    { id: "p2", heroId: "fixture-p2", you: false, handCount: 5, deckCount: 10, discard: [], hasCommitted: false, counters: {}, flags: {} },
  ],
  combat: null,
  prompt: null,
  winner: null,
  ...over,
});

const boost = (card: string): Action => ({ type: "BOOST_MOVE", player: "p1", card });
const endManeuver: Action = { type: "END_MANEUVER", player: "p1" };

describe("maneuverBoostHint (issue #85)", () => {
  it("returns null outside MANEUVER_MOVE", () => {
    expect(maneuverBoostHint(view({ turnPhase: "ACTION_SELECT", maneuver: null }), [])).toBeNull();
  });

  it("returns null during the opponent's maneuver", () => {
    const v = view({ activePlayer: "p2", maneuver: { boostApplied: 0, boosted: false, moved: ["p2/hero"] } });
    expect(maneuverBoostHint(v, [])).toBeNull();
  });

  it("offers the discard tip while boost actions are on the table", () => {
    expect(maneuverBoostHint(view({}), [boost("thrall/lightning-bolt#1"), endManeuver])).toMatch(/discard a card/);
  });

  it("explains the spent boost once applied", () => {
    const v = view({ maneuver: { boostApplied: 2, boosted: true, moved: [] } });
    expect(maneuverBoostHint(v, [endManeuver])).toBe("move boosted +2 this maneuver");
  });

  it("explains the gate when the sole fighter already moved (nitetrio's case)", () => {
    const v = view({ maneuver: { boostApplied: 0, boosted: false, moved: ["p1/hero"] } });
    expect(maneuverBoostHint(v, [endManeuver])).toBe(
      "Thrall already moved — boost is no longer available this maneuver"
    );
  });

  it("uses the plural wording when a whole team has moved", () => {
    const v = view({
      fighters: [
        fighter({}),
        fighter({ id: "p1/sidekick-1", kind: "SIDEKICK", name: "Wolf", space: "s3" }),
        fighter({ id: "p2/hero", owner: "p2", name: "The Mandalorian", space: "s2" }),
      ],
      maneuver: { boostApplied: 0, boosted: false, moved: ["p1/hero", "p1/sidekick-1"] },
    });
    expect(maneuverBoostHint(v, [endManeuver])).toBe(
      "all your fighters have moved — boost is no longer available this maneuver"
    );
  });

  it("ignores defeated/off-board fighters when deciding everyone has moved", () => {
    const v = view({
      fighters: [
        fighter({}),
        fighter({ id: "p1/sidekick-1", kind: "SIDEKICK", name: "Wolf", space: null, defeated: true }),
        fighter({ id: "p2/hero", owner: "p2", name: "The Mandalorian", space: "s2" }),
      ],
      maneuver: { boostApplied: 0, boosted: false, moved: ["p1/hero"] },
    });
    expect(maneuverBoostHint(v, [endManeuver])).toBe(
      "Thrall already moved — boost is no longer available this maneuver"
    );
  });

  it("falls back to the no-boostable-cards wording pre-move", () => {
    expect(maneuverBoostHint(view({}), [endManeuver])).toBe("no boostable cards in hand");
  });

  // Issue #285: a fighter that is mid-PREVIEW (stepped locally but not yet
  // committed) is NOT in `maneuver.moved` — the whole walk lands as one
  // MOVE_FIGHTER only on commit. So the hint must still treat it as un-moved and
  // keep boost on the table; the local ghost never suppresses the boost tip.
  it("keeps boost eligible for a fighter that is only mid-preview (not yet committed)", () => {
    const v = view({ maneuver: { boostApplied: 0, boosted: false, moved: [] } });
    expect(maneuverBoostHint(v, [boost("thrall/lightning-bolt#1"), endManeuver])).toMatch(/discard a card/);
  });
});
