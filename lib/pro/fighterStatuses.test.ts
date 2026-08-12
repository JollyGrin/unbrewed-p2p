/**
 * Per-fighter status registry (issue #371). These prove the resolver is generic
 * and data-driven off ViewFighter.statuses: a PINNED status yields the rooted rim
 * badge, the badge is absent when the status leaves the list, unknown kinds are
 * skipped, and a new kind is one registry entry away — no consumer change.
 */
import { FIGHTER_STATUS_BADGES, fighterStatusBadgesFor } from "./fighterStatuses";
import type { ViewFighter } from "./protocol";

const fighter = (over: Partial<ViewFighter> = {}): ViewFighter => ({
  id: "p2/hero",
  owner: "p2",
  kind: "HERO",
  name: "Malfurion",
  space: "A1",
  tailSpace: null,
  hp: 12,
  maxHp: 18,
  reach: "MELEE",
  size: "NORMAL",
  defeated: false,
  ...over,
});

describe("FIGHTER_STATUS_BADGES registry", () => {
  it("maps PINNED to a rooted rim badge distinct from the druid-form palette", () => {
    const pinned = FIGHTER_STATUS_BADGES.PINNED;
    expect(pinned).toBeDefined();
    expect(pinned.label).toBe("Rooted");
    expect(pinned.title.toLowerCase()).toContain("rooted");
    // Palette must not collide with any Malfurion druid-form bg (brown/blue/green)
    // so it never reads as a form badge.
    expect(["#5A351C", "#244D7A", "#2E6B48"]).not.toContain(pinned.bg);
  });
});

describe("MERIDIAN (issue #596 ↔ engine #360)", () => {
  it("registers the mark as a per-FIGHTER status, not a per-player hero flag", () => {
    const mark = FIGHTER_STATUS_BADGES.MERIDIAN;
    expect(mark).toBeDefined();
    expect(mark.kind).toBe("MERIDIAN");
    expect(mark.label).toBe("Marked");
    expect(mark.title.toLowerCase()).toContain("meridian");
    // Visibly NOT the PINNED slate: both can sit on the same token at once.
    expect(mark.bg).not.toBe(FIGHTER_STATUS_BADGES.PINNED.bg);
  });

  it("badges an OPPOSING hero — the fighter that takes the end-of-turn ping", () => {
    const marked = fighter({ owner: "p2", statuses: [{ kind: "MERIDIAN" }] });
    expect(fighterStatusBadgesFor(marked).map((b) => b.kind)).toEqual(["MERIDIAN"]);
  });

  it("badges a marked SIDEKICK too (the reason this is not a hero-gated flag)", () => {
    const kick = fighter({ id: "p2/sidekick-1", kind: "SIDEKICK", name: "Ally", statuses: [{ kind: "MERIDIAN" }] });
    expect(fighterStatusBadgesFor(kick).map((b) => b.kind)).toEqual(["MERIDIAN"]);
  });

  it("stacks with PINNED, in statuses order, when a fighter carries both", () => {
    const both = fighter({ statuses: [{ kind: "PINNED" }, { kind: "MERIDIAN" }] });
    expect(fighterStatusBadgesFor(both).map((b) => b.kind)).toEqual(["PINNED", "MERIDIAN"]);
  });

  it("clears the instant the engine drops the mark", () => {
    expect(fighterStatusBadgesFor(fighter({ statuses: [] }))).toEqual([]);
  });
});

describe("fighterStatusBadgesFor", () => {
  it("returns [] for a fighter with no statuses", () => {
    expect(fighterStatusBadgesFor(fighter())).toEqual([]);
    expect(fighterStatusBadgesFor(fighter({ statuses: [] }))).toEqual([]);
  });

  it("yields the rooted badge while a PINNED status is present", () => {
    const badges = fighterStatusBadgesFor(
      fighter({ statuses: [{ kind: "PINNED", expiresAtTurn: 4, expiresAt: "END" }] })
    );
    expect(badges).toHaveLength(1);
    expect(badges[0].kind).toBe("PINNED");
    expect(badges[0].label).toBe("Rooted");
  });

  it("clears the badge once the status leaves the list (pin expiry / unpin)", () => {
    const rooted = fighter({ statuses: [{ kind: "PINNED" }] });
    const freed = fighter({ statuses: [] });
    expect(fighterStatusBadgesFor(rooted)).toHaveLength(1);
    expect(fighterStatusBadgesFor(freed)).toHaveLength(0);
  });

  it("works for a rooted sidekick as well as a rooted hero", () => {
    const kick = fighter({ id: "p2/sidekick-1", kind: "SIDEKICK", name: "Wisp", statuses: [{ kind: "PINNED" }] });
    expect(fighterStatusBadgesFor(kick)).toHaveLength(1);
    expect(fighterStatusBadgesFor(kick)[0].kind).toBe("PINNED");
  });

  it("silently skips a status kind the client doesn't map yet", () => {
    const badges = fighterStatusBadgesFor(
      fighter({ statuses: [{ kind: "PINNED" }, { kind: "FUTURE_UNKNOWN_EFFECT" }] })
    );
    expect(badges.map((b) => b.kind)).toEqual(["PINNED"]);
  });
});
