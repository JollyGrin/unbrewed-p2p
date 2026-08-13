/**
 * Per-fighter status registry (issue #371). These prove the resolver is generic
 * and data-driven off ViewFighter.statuses: a PINNED status yields the rooted rim
 * badge, the badge is absent when the status leaves the list, unknown kinds are
 * skipped, and a new kind is one registry entry away — no consumer change.
 */
import {
  FIGHTER_MARKER_BADGES,
  FIGHTER_STATUS_BADGES,
  fighterStatusBadgesFor,
} from "./fighterStatuses";
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

describe("MARKED / MERIDIAN (issue #596 ↔ engine #360, protocol v29)", () => {
  it("keys the mark by NAME, not kind — 'MARKED' says only 'a durable marker'", () => {
    // The engine emits { kind: 'MARKED', name: 'MERIDIAN', count } (verified against
    // engine #360's view builder + kenshiro.rules.ts). A kind-keyed 'MERIDIAN' entry
    // — which is what this client shipped first — never matches and renders nowhere.
    expect(FIGHTER_STATUS_BADGES.MERIDIAN).toBeUndefined();
    expect(FIGHTER_STATUS_BADGES.MARKED).toBeUndefined();
    expect(FIGHTER_MARKER_BADGES.MERIDIAN).toBeDefined();
    expect(FIGHTER_MARKER_BADGES.MERIDIAN.label).toBe("Meridian");
  });

  it("badges a marked OPPOSING hero — the fighter that takes the end-of-turn tick", () => {
    const badges = fighterStatusBadgesFor(
      fighter({ owner: "p2", statuses: [{ kind: "MARKED", name: "MERIDIAN", count: 1 }] })
    );
    expect(badges).toHaveLength(1);
    expect(badges[0]).toMatchObject({ kind: "MARKED", key: "MARKED:MERIDIAN", count: 1 });
    expect(badges[0].title).toContain("Kenshiro");
  });

  it("badges a marked SIDEKICK too — the reason this is not a per-player hero flag", () => {
    const kick = fighter({
      id: "p2/sidekick-1",
      kind: "SIDEKICK",
      name: "Ally",
      statuses: [{ kind: "MARKED", name: "MERIDIAN", count: 1 }],
    });
    expect(fighterStatusBadgesFor(kick).map((b) => b.key)).toEqual(["MARKED:MERIDIAN"]);
  });

  it("carries the stack count, and puts it in the tooltip (it IS the damage dealt)", () => {
    const badges = fighterStatusBadgesFor(
      fighter({ statuses: [{ kind: "MARKED", name: "MERIDIAN", count: 3 }] })
    );
    expect(badges[0].count).toBe(3);
    expect(badges[0].title).toBe("Meridian ×3 — takes 3 damage at the end of Kenshiro's turn");
  });

  it("defaults a countless entry to one stack rather than dropping it", () => {
    expect(fighterStatusBadgesFor(fighter({ statuses: [{ kind: "MARKED", name: "MERIDIAN" }] }))[0])
      .toMatchObject({ count: 1 });
  });

  it("renders an UNKNOWN marker name generically instead of hiding public state", () => {
    // protocol v29: "a name it does not know should still render a generic mark with
    // the count" — e.g. Inigo's REVENGE tokens, landing before this client knows them.
    const badges = fighterStatusBadgesFor(
      fighter({ statuses: [{ kind: "MARKED", name: "REVENGE", count: 2 }] })
    );
    expect(badges).toHaveLength(1);
    expect(badges[0]).toMatchObject({ key: "MARKED:REVENGE", label: "REVENGE", count: 2 });
    expect(badges[0].title).toBe("REVENGE ×2");
  });

  it("gives every badge a UNIQUE key — several markers can ride one fighter", () => {
    const badges = fighterStatusBadgesFor(
      fighter({
        statuses: [
          { kind: "PINNED" },
          { kind: "MARKED", name: "MERIDIAN", count: 1 },
          { kind: "MARKED", name: "REVENGE", count: 2 },
        ],
      })
    );
    expect(badges.map((b) => b.key)).toEqual(["PINNED", "MARKED:MERIDIAN", "MARKED:REVENGE"]);
    expect(new Set(badges.map((b) => b.key)).size).toBe(3);
  });

  it("keeps the Meridian palette clear of the PINNED slate — both can sit on one token", () => {
    expect(FIGHTER_MARKER_BADGES.MERIDIAN.bg).not.toBe(FIGHTER_STATUS_BADGES.PINNED.bg);
  });

  it("clears the instant the engine drops the mark (turn-edge sweep, clear, or defeat)", () => {
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
