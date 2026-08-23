/**
 * Defender substitution (protocol v34 ↔ engine #494 — Ellen Ripley's *GET BEHIND
 * ME*). The unit is tiny; what it has to get RIGHT is the lifetime rule, because
 * the one thing worse than not drawing the substitution is drawing it on the
 * wrong fighter after it stopped being true.
 */
import {
  combatSidesLine,
  defenderChanges,
  defenderSwapStillLive,
  defenderSwapText,
  latestDefenderChange,
} from "./combatDefender";
import { GameEvent, PlayerView, ViewCombat } from "./protocol";

const combat = (over: Partial<ViewCombat> = {}): ViewCombat => ({
  attackerPlayer: "p2",
  defenderPlayer: "p1",
  attacker: "p2/hero",
  target: "p1/hero",
  stage: "IMMEDIATELY",
  attackerCard: null,
  defenderCard: null,
  additionalDefenseCard: null,
  outcome: null,
  attackDamageDealt: null,
  ...over,
});

const view = (over: Partial<PlayerView> = {}): PlayerView =>
  ({
    you: "p1",
    phase: "PLAY",
    turnNumber: 3,
    activePlayer: "p2",
    actionsRemaining: 1,
    turnPhase: null,
    maneuver: null,
    map: { schemaVersion: "1", id: "m", meta: { title: "m", minPlayers: 2, maxPlayers: 2, specialRules: false }, zones: [], spaces: [] },
    catalog: {},
    fighters: [],
    tokens: [],
    self: { id: "p1", heroId: "ellen-ripley", hand: [], deckCount: 10, discard: [], committedCard: null, counters: {}, flags: {}, wonCombatThisTurn: false, lostCombatThisTurn: false, firstAttackThisTurn: false, playedACardThisTurn: false, tookDamageThisTurn: false },
    opponent: null,
    players: [],
    combat: null,
    prompt: null,
    winner: null,
    ...over,
  }) as PlayerView;

const CHANGE: GameEvent = { type: "COMBAT_DEFENDER_CHANGED", from: "p1/hero", to: "p1/sidekick-1" };
const BACK: GameEvent = { type: "COMBAT_DEFENDER_CHANGED", from: "p1/sidekick-1", to: "p1/hero" };

describe("defenderChanges", () => {
  it("reads every substitution in the batch, in order", () => {
    expect(defenderChanges([{ type: "COMBAT_ENDED" }, CHANGE, BACK])).toEqual([
      { from: "p1/hero", to: "p1/sidekick-1" },
      { from: "p1/sidekick-1", to: "p1/hero" },
    ]);
  });

  it("is empty for a pre-v34 / substitution-free batch", () => {
    expect(defenderChanges([{ type: "COMBAT_DAMAGE", amount: 3 }])).toEqual([]);
    expect(defenderChanges([])).toEqual([]);
  });
});

describe("latestDefenderChange", () => {
  it("is the LAST one — a chain leaves the final fighter defending", () => {
    expect(latestDefenderChange([CHANGE, BACK])).toEqual({ from: "p1/sidekick-1", to: "p1/hero" });
  });

  it("is null with nothing to report", () => {
    expect(latestDefenderChange([{ type: "COMBAT_ENDED" }])).toBeNull();
  });
});

describe("defenderSwapStillLive", () => {
  it("holds while the view agrees the substituted fighter is defending", () => {
    const v = view({ combat: combat({ target: "p1/sidekick-1" }) });
    expect(defenderSwapStillLive({ from: "p1/hero", to: "p1/sidekick-1" }, v)).toBe(true);
  });

  it("drops the moment the combat ends", () => {
    expect(defenderSwapStillLive({ from: "p1/hero", to: "p1/sidekick-1" }, view())).toBe(false);
  });

  it("drops when a NEW combat targets somebody else", () => {
    // The hazard this guards: a second combat opening on the same batch would
    // otherwise leave a violet 'steps in' ring on a fighter nobody is attacking.
    const v = view({ combat: combat({ target: "p1/hero" }) });
    expect(defenderSwapStillLive({ from: "p1/hero", to: "p1/sidekick-1" }, v)).toBe(false);
  });
});

describe("defenderSwapText", () => {
  it("words the same fact once for the chip, the tag and the log", () => {
    const copy = defenderSwapText("Ellen Ripley", "Newt");
    expect(copy.chip).toBe("steps in");
    expect(copy.tag).toBe("NEWT STEPS IN");
    expect(copy.full).toBe(
      "Newt steps in as the defender (Ellen Ripley steps back) — the damage lands on Newt"
    );
  });

  it("says where the damage lands, which is the whole point of the event", () => {
    expect(defenderSwapText("Newt", "Ellen Ripley").full).toContain("damage lands on Ellen Ripley");
  });
});

describe("combatSidesLine", () => {
  it("names both sides, so a replay step says WHO is defending", () => {
    // The replay scrubber has no event stream: the substitution is only readable
    // there because this defender name changes from one step to the next.
    expect(combatSidesLine("Thrall", "Ellen Ripley")).toBe("Thrall → Ellen Ripley");
    expect(combatSidesLine("Thrall", "Newt")).toBe("Thrall → Newt");
  });
});
