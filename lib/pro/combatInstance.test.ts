import { isNewCombat } from "./combatInstance";
import type { GameEvent, ViewCombat } from "./protocol";

const c = (over: Partial<ViewCombat> = {}): ViewCombat =>
  ({
    attackerPlayer: "p1",
    defenderPlayer: "p2",
    attacker: "p1/hero",
    target: "p2/hero",
    stage: "COMMIT_DEFENSE",
    attackerCard: null,
    defenderCard: null,
    ...over,
  }) as ViewCombat;

describe("isNewCombat", () => {
  it("a combat appearing is new; no combat is never new", () => {
    expect(isNewCombat(null, c())).toBe(true);
    expect(isNewCombat(c(), null)).toBe(false);
  });

  it("walking forward through one combat — reveal included — is the same combat", () => {
    expect(isNewCombat(c(), c({ stage: "DURING", attackerCard: { instance: "a#1" } as ViewCombat["attackerCard"] }))).toBe(false);
    const revealed = c({ stage: "DURING", attackerCard: { instance: "a#1" } as ViewCombat["attackerCard"] });
    expect(isNewCombat(revealed, { ...revealed, stage: "AFTER" })).toBe(false);
  });

  it("a chained attack by the same fighter on the same target is new (stage restarts)", () => {
    // No attack card on either side: the restarted stage is the ONLY signal.
    expect(isNewCombat(c({ stage: "AFTER" }), c({ stage: "COMMIT_DEFENSE" }))).toBe(true);
    const after = c({ stage: "AFTER", attackerCard: { instance: "a#1" } as ViewCombat["attackerCard"] });
    expect(isNewCombat(after, c({ stage: "COMMIT_DEFENSE" }))).toBe(true);
  });

  it("a replaced attack card is new even at the same stage", () => {
    const one = c({ stage: "DURING", attackerCard: { instance: "sub-attack:1" } as ViewCombat["attackerCard"] });
    expect(isNewCombat(one, { ...one, attackerCard: { instance: "sub-attack:2" } as ViewCombat["attackerCard"] })).toBe(true);
  });

  it("a different attacker, target or seat is new", () => {
    expect(isNewCombat(c(), c({ attacker: "p1/sk1" }))).toBe(true);
    expect(isNewCombat(c(), c({ target: "p2/sk1" }))).toBe(true);
    expect(isNewCombat(c(), c({ attackerPlayer: "p2", defenderPlayer: "p1" }))).toBe(true);
  });

  // Appa's Hallucinations / the Xenomorph's Marked Blip: the ATTACKER moves inside
  // the same combat. The batch's COMBAT_ATTACKER_CHANGED is what tells it apart.
  describe("attacker takeover (COMBAT_ATTACKER_CHANGED)", () => {
    const takeover: GameEvent = { type: "COMBAT_ATTACKER_CHANGED", from: "p1/hero", to: "p1/sidekick-1" };

    it("is NOT a new combat when the batch explains the attacker change", () => {
      expect(isNewCombat(c(), c({ attacker: "p1/sidekick-1", stage: "IMMEDIATELY" }), [takeover])).toBe(false);
    });

    it("is still new without the event, or when the event names other fighters", () => {
      const next = c({ attacker: "p1/sidekick-1" });
      expect(isNewCombat(c(), next)).toBe(true);
      expect(isNewCombat(c(), next, [])).toBe(true);
      expect(isNewCombat(c(), next, [{ ...takeover, from: "p1/sidekick-2" } as GameEvent])).toBe(true);
    });

    it("a takeover does not excuse a changed target or a restarted stage", () => {
      expect(isNewCombat(c(), c({ attacker: "p1/sidekick-1", target: "p2/sk1" }), [takeover])).toBe(true);
      expect(
        isNewCombat(c({ stage: "AFTER" }), c({ attacker: "p1/sidekick-1", stage: "COMMIT_DEFENSE" }), [takeover])
      ).toBe(true);
    });
  });
});
