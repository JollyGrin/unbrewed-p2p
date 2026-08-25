/**
 * The /collection hero picker's ordering (#625). The picker shows every hero's
 * numbers at rest, so ORDER is what makes 25 rows readable: the heroes you have
 * actually played, richest first, and everything else collapsed behind them.
 */
import { HeroCosmetics } from "@/lib/account/cosmetics";
import { heroPickerSections } from "./picker";
import { collectionRoster } from "./roster";

const hero = (heroId: string, over: Partial<HeroCosmetics> = {}): HeroCosmetics => ({
  heroId,
  earned: 100,
  spent: 0,
  adjusted: 0,
  available: 100,
  cards: [],
  tokenRim: { unlockedTier: 0, enabled: false, selectedTier: null },
  cardRims: { enabled: true, selectedTier: null },
  ...over,
});

const names = (rows: { hero: { heroId: string } }[]) => rows.map((row) => row.hero.heroId);

describe("heroPickerSections", () => {
  it("ranks the heroes with points by EARNED, descending", () => {
    const heroes = [
      hero("thrall", { earned: 300, available: 300 }),
      hero("batman", { earned: 900, available: 40 }),
      hero("kenshiro", { earned: 500, available: 500 }),
    ];
    const { ranked } = heroPickerSections(collectionRoster(heroes.map((h) => h.heroId)), heroes);
    // Batman is broke and still top: earned is a record of what you did, and
    // spending it on card art must never demote you.
    expect(names(ranked)).toEqual(["batman", "kenshiro", "thrall"]);
    expect(ranked[0]).toMatchObject({ earned: 900, available: 40 });
  });

  it("collapses the zero-point heroes into an alphabetical 'more' section", () => {
    const heroes = [hero("thrall", { earned: 300, available: 300 })];
    const { ranked, more } = heroPickerSections(
      collectionRoster(heroes.map((h) => h.heroId)),
      heroes,
    );
    expect(names(ranked)).toEqual(["thrall"]);
    expect(more.length).toBeGreaterThan(20);
    const labels = more.map((row) => row.hero.name);
    expect([...labels].sort((a, b) => a.localeCompare(b))).toEqual(labels);
    // Never played = zero, not unknown: the row says "0", not "—".
    expect(more[0]).toMatchObject({ earned: 0, available: 0, rim: null });
    expect(names(more)).not.toContain("thrall");
  });

  it("keeps an API row with no points out of the ranked half", () => {
    const heroes = [hero("thrall", { earned: 0, available: 0 })];
    const { ranked, more } = heroPickerSections(collectionRoster(["thrall"]), heroes);
    expect(ranked).toHaveLength(0);
    expect(names(more)).toContain("thrall");
  });

  it("carries each hero's unlocked rim tier as a real paint name", () => {
    const heroes = [
      hero("thrall", { earned: 900, tokenRim: { unlockedTier: 2, enabled: true, selectedTier: null } }),
      hero("batman", { earned: 100, tokenRim: { unlockedTier: 0, enabled: false, selectedTier: null } }),
    ];
    const { ranked } = heroPickerSections(collectionRoster(["thrall", "batman"]), heroes);
    expect(ranked.map((row) => row.rim)).toEqual(["silver", null]);
  });

  it("never lists a reflavored baseline, even with points on it", () => {
    const heroes = [hero("thetis", { earned: 5000, available: 5000 })];
    const sections = heroPickerSections(collectionRoster(["thetis"]), heroes);
    expect(names(sections.ranked)).not.toContain("thetis");
    expect(names(sections.more)).not.toContain("thetis");
    // The successor is still there — the points fold into it upstream.
    expect(names(sections.more)).toContain("thetis-spice");
  });

  it("lists a hero only the API knows about", () => {
    const heroes = [hero("some-retired-hero", { earned: 700, available: 700 })];
    const { ranked } = heroPickerSections(collectionRoster(["some-retired-hero"]), heroes);
    expect(ranked[0]).toMatchObject({ earned: 700 });
    expect(ranked[0].hero).toMatchObject({ heroId: "some-retired-hero", name: "Some Retired Hero" });
  });

  it("keeps the API's own order for the heroes it reported when points are unknown", () => {
    // A telemetry outage: every balance is null, so nothing can be ranked by
    // points — but "you have a history on these three" survives, and an outage
    // must never read as "you have no heroes".
    const heroes = ["kenshiro", "thrall", "batman"].map((id) =>
      hero(id, { earned: null, available: null, tokenRim: { unlockedTier: null, enabled: true, selectedTier: null } }),
    );
    const { ranked, more } = heroPickerSections(
      collectionRoster(heroes.map((h) => h.heroId)),
      heroes,
      true,
    );
    expect(names(ranked)).toEqual(["kenshiro", "thrall", "batman"]);
    expect(ranked[0]).toMatchObject({ earned: null, available: null, rim: null });
    // A hero the API never mentioned is UNKNOWN during an outage, not zero.
    expect(more[0]).toMatchObject({ earned: null, available: null });
  });

  it("sorts a hero whose points are unknown behind every hero whose aren't", () => {
    const heroes = [
      hero("thrall", { earned: null, available: null }),
      hero("batman", { earned: 10, available: 10 }),
    ];
    const { ranked } = heroPickerSections(collectionRoster(["thrall", "batman"]), heroes, true);
    expect(names(ranked)).toEqual(["batman", "thrall"]);
  });
});
