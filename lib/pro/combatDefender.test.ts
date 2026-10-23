/**
 * Defender substitution (protocol v34 ↔ engine #494 — Ellen Ripley's *GET BEHIND
 * ME*). The unit is tiny; what it has to get RIGHT is the lifetime rule, because
 * the one thing worse than not drawing the substitution is drawing it on the
 * wrong fighter after it stopped being true.
 */
import {
  EMPTY_COMBAT_TARGETING,
  advanceCombatTargeting,
  attackerChanges,
  attackerSwapStillLive,
  attackerSwapText,
  defenderChangeKind,
  latestAttackerChange,
  combatSidesLine,
  defenderChanges,
  defenderRedirect,
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
    expect(copy.chip).toBe("defends instead");
    expect(copy.tag).toBe("NEWT DEFENDS INSTEAD");
    expect(copy.full).toBe(
      "Newt takes over from Ellen Ripley as the defender — the damage lands on Newt"
    );
  });

  it("says where the damage lands, which is the whole point of the event", () => {
    expect(defenderSwapText("Newt", "Ellen Ripley").full).toContain("damage lands on Ellen Ripley");
  });

  // Issue #737. Ripley's GET BEHIND ME is the DEFENDING seat protecting its own
  // fighter; Appa's Hallucinations is the ATTACKING seat reaching across the table
  // and substituting among the OPPONENT's fighters. Same event, opposite agency —
  // so the one wording must not claim anybody volunteered.
  it("never implies the new defender chose it — an attacker can force the swap", () => {
    const copy = defenderSwapText("General Grievous", "Battle Droid 2");
    for (const text of [copy.chip, copy.tag, copy.full]) {
      expect(text.toLowerCase()).not.toContain("steps in");
      expect(text.toLowerCase()).not.toContain("steps back");
    }
    expect(copy.full).toBe(
      "Battle Droid 2 takes over from General Grievous as the defender — the damage lands on Battle Droid 2"
    );
  });

  it("survives a name that ends in s — no \"Clone Troopers's\"", () => {
    // Found in the live pair run: the Clone Troopers hero is NAMED "Clone
    // Troopers", so any possessive in this sentence reads broken. The wording
    // therefore carries none.
    const copy = defenderSwapText("Clone Troopers", "Clone Trooper 1");
    expect(copy.full).toBe(
      "Clone Trooper 1 takes over from Clone Troopers as the defender — the damage lands on Clone Trooper 1",
    );
    expect(copy.full).not.toContain("'s");
  });

  it("stays seat-neutral: no viewer-relative pronoun in any of the three surfaces", () => {
    // The board chip, the panel tag and the log line are all read by BOTH players
    // (gameLog emits the substitution line as `who: "game"`), and Hallucinations
    // makes "your"/"their" wrong for one of them whichever way it is written.
    const copy = defenderSwapText("Appa", "Momo");
    for (const text of [copy.chip, copy.tag, copy.full]) {
      expect(text).not.toMatch(/\b(your|yours|their|theirs|you|they)\b/i);
    }
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

// ---------------------------------------------------------------------------
// The DECLARED target (issue #694) — Grievous's Multi-Arm Barrage Combat 2, which
// opens against a fighter nobody declared against and emits no v34 event at all.
// ---------------------------------------------------------------------------

const DECLARED: GameEvent = { type: "ATTACK_DECLARED", attacker: "p2/hero", target: "p1/hero" };
const BONUS = (target: string): GameEvent => ({
  type: "BONUS_ATTACK_STARTED",
  attacker: "p2/hero",
  target,
});

describe("advanceCombatTargeting", () => {
  it("records the declaration", () => {
    expect(advanceCombatTargeting(EMPTY_COMBAT_TARGETING, [DECLARED])).toEqual({
      declared: "p1/hero",
      attacker: "p2/hero",
    });
  });

  it("HOLDS it through the same attacker's bonus attack — the whole point", () => {
    // Combat 2's own target must not overwrite the declaration, or there is
    // nothing left to compare it against.
    const after = advanceCombatTargeting(EMPTY_COMBAT_TARGETING, [
      DECLARED,
      { type: "COMBAT_ENDED" },
      BONUS("p1/sidekick-1"),
    ]);
    expect(after).toEqual({ declared: "p1/hero", attacker: "p2/hero" });
  });

  it("holds it across batches, since Combat 2 is usually a later broadcast", () => {
    const first = advanceCombatTargeting(EMPTY_COMBAT_TARGETING, [DECLARED]);
    expect(advanceCombatTargeting(first, [BONUS("p1/sidekick-1")]).declared).toBe("p1/hero");
  });

  it("takes a sub-attack / effect attack at its own word — nobody declared those", () => {
    const declared = advanceCombatTargeting(EMPTY_COMBAT_TARGETING, [DECLARED]);
    expect(
      advanceCombatTargeting(declared, [
        { type: "SUB_ATTACK_INITIATED", attacker: "p2/sidekick-1", target: "p1/sidekick-1", value: 3 },
      ])
    ).toEqual({ declared: "p1/sidekick-1", attacker: "p2/sidekick-1" });
    expect(
      advanceCombatTargeting(declared, [
        { type: "EFFECT_ATTACK_INITIATED", attacker: "p2/hero", target: "p1/sidekick-1", card: "boba-fett/seismic-charge" },
      ])
    ).toEqual({ declared: "p1/sidekick-1", attacker: "p2/hero" });
  });

  it("does not claim provenance for another attacker's bonus attack", () => {
    const declared = advanceCombatTargeting(EMPTY_COMBAT_TARGETING, [DECLARED]);
    expect(
      advanceCombatTargeting(declared, [
        { type: "BONUS_ATTACK_STARTED", attacker: "p2/sidekick-1", target: "p1/sidekick-1" },
      ])
    ).toEqual({ declared: "p1/sidekick-1", attacker: "p2/sidekick-1" });
  });

  it("clears at the turn edge — an attack action cannot outlive its turn", () => {
    const declared = advanceCombatTargeting(EMPTY_COMBAT_TARGETING, [DECLARED]);
    expect(advanceCombatTargeting(declared, [{ type: "TURN_ENDED", player: "p2" }])).toEqual(
      EMPTY_COMBAT_TARGETING
    );
  });
});

describe("defenderRedirect", () => {
  const declared = advanceCombatTargeting(EMPTY_COMBAT_TARGETING, [DECLARED]);

  it("names the move when the combat opened somewhere else", () => {
    expect(defenderRedirect(declared, combat({ target: "p1/sidekick-1" }))).toEqual({
      from: "p1/hero",
      to: "p1/sidekick-1",
    });
  });

  it("is silent on the declared target", () => {
    expect(defenderRedirect(declared, combat())).toBeNull();
  });

  it("also covers the mid-combat substitution, which moves the same field", () => {
    // One derivation for the whole family: `combat.target` moving off the declared
    // fighter is what a `setCombatDefender` looks like from the view's side too.
    expect(defenderRedirect(declared, combat({ target: "p1/sidekick-1", stage: "DURING" }))).toEqual(
      { from: "p1/hero", to: "p1/sidekick-1" }
    );
  });

  it("makes no claim about another attacker's combat", () => {
    expect(
      defenderRedirect(declared, combat({ attacker: "p2/sidekick-1", target: "p1/sidekick-1" }))
    ).toBeNull();
  });

  it("stays silent with no declaration — a reconnect carries no events", () => {
    expect(defenderRedirect(EMPTY_COMBAT_TARGETING, combat({ target: "p1/sidekick-1" }))).toBeNull();
    expect(defenderRedirect(declared, null)).toBeNull();
  });
});

describe("defenderSwapText — REDIRECTED", () => {
  it("does NOT reuse the substitution wording: nothing was substituted here", () => {
    const copy = defenderSwapText("Obi-Wan Kenobi", "Clone Trooper", "REDIRECTED");
    expect(copy.chip).toBe("now defending");
    expect(copy.tag).toBe("NOW DEFENDING: CLONE TROOPER");
    expect(copy.full).toContain("Clone Trooper is defending this attack");
    expect(copy.full).toContain("redirected away from Obi-Wan Kenobi");
    expect(copy.full).toContain("damage lands on Clone Trooper");
  });

  it("keeps the substitution wording as the default, so v34 callers are untouched", () => {
    expect(defenderSwapText("Ellen Ripley", "Newt")).toEqual(
      defenderSwapText("Ellen Ripley", "Newt", "SUBSTITUTED")
    );
  });
});

describe("post-damage defender takeover", () => {
  const DAMAGE: GameEvent = { type: "COMBAT_DAMAGE", amount: 1 };

  it("flags a substitution that arrives after COMBAT_DAMAGE, and only that one", () => {
    expect(defenderChanges([CHANGE, DAMAGE, BACK])).toEqual([
      { from: "p1/hero", to: "p1/sidekick-1" },
      { from: "p1/sidekick-1", to: "p1/hero", afterDamage: true },
    ]);
    expect(latestDefenderChange([DAMAGE, CHANGE])).toEqual({
      from: "p1/hero",
      to: "p1/sidekick-1",
      afterDamage: true,
    });
  });

  it("uses neutral wording that never claims the damage lands on the new defender", () => {
    const [change] = defenderChanges([DAMAGE, CHANGE]);
    const copy = defenderSwapText("Blip 2", "Xenomorph", defenderChangeKind(change));
    expect(copy.full).toBe("Xenomorph takes over the defense from Blip 2");
    expect(copy.tag).toBe("XENOMORPH TAKES OVER THE DEFENSE");
    for (const text of [copy.chip, copy.tag, copy.full]) {
      expect(text.toLowerCase()).not.toContain("instead");
      expect(text.toLowerCase()).not.toContain("lands");
    }
  });

  it("keeps the pre-damage wording when the change is not after damage", () => {
    expect(defenderChangeKind({})).toBe("SUBSTITUTED");
  });

  it("tolerates a combat that is gone or past the damage step — no crash, no stale chip", () => {
    const [swap] = defenderChanges([DAMAGE, CHANGE]);
    expect(defenderSwapStillLive(swap, view())).toBe(false);
    expect(
      defenderSwapStillLive(swap, view({ combat: combat({ target: "p1/sidekick-1", stage: "AFTER" }) }))
    ).toBe(true);
    expect(
      defenderSwapStillLive(swap, view({ combat: combat({ target: "p1/hero", stage: "AFTER" }) }))
    ).toBe(false);
  });
});

describe("attacker substitution (protocol v36)", () => {
  const TAKE: GameEvent = { type: "COMBAT_ATTACKER_CHANGED", from: "p2/hero", to: "p2/sidekick-1" };

  it("parses every attacker change in order and ignores defender events", () => {
    const back: GameEvent = { type: "COMBAT_ATTACKER_CHANGED", from: "p2/sidekick-1", to: "p2/hero" };
    expect(attackerChanges([CHANGE, TAKE, back])).toEqual([
      { from: "p2/hero", to: "p2/sidekick-1" },
      { from: "p2/sidekick-1", to: "p2/hero" },
    ]);
    expect(latestAttackerChange([TAKE, back])).toEqual({ from: "p2/sidekick-1", to: "p2/hero" });
    expect(latestAttackerChange([CHANGE])).toBeNull();
  });

  it("words the chip, tag and log line once", () => {
    const copy = attackerSwapText("Xenomorph", "Blip 2");
    expect(copy.chip).toBe("attacks instead");
    expect(copy.tag).toBe("BLIP 2 ATTACKS INSTEAD");
    expect(copy.full).toBe("Blip 2 takes over from Xenomorph as the attacker");
  });

  it("retires the standing chip once combat.attacker no longer agrees", () => {
    const swap = { from: "p2/hero", to: "p2/sidekick-1" };
    expect(attackerSwapStillLive(swap, view({ combat: combat({ attacker: "p2/sidekick-1" }) }))).toBe(true);
    expect(attackerSwapStillLive(swap, view({ combat: combat({ attacker: "p2/hero" }) }))).toBe(false);
    expect(attackerSwapStillLive(swap, view())).toBe(false);
  });

  it("keeps the declared target across a takeover so the redirect fact survives", () => {
    const declared = advanceCombatTargeting(EMPTY_COMBAT_TARGETING, [
      { type: "ATTACK_DECLARED", attacker: "p2/hero", target: "p1/hero" } as GameEvent,
    ]);
    const after = advanceCombatTargeting(declared, [TAKE]);
    expect(after).toEqual({ declared: "p1/hero", attacker: "p2/sidekick-1" });
    // the takeover is not a redirect; a genuinely different target still is
    expect(defenderRedirect(after, combat({ attacker: "p2/sidekick-1", target: "p1/hero" }))).toBeNull();
    expect(defenderRedirect(after, combat({ attacker: "p2/sidekick-1", target: "p1/sidekick-1" }))).toEqual({
      from: "p1/hero",
      to: "p1/sidekick-1",
    });
  });
});
