import type { HeroListing } from "@/lib/pro/protocol";
import { POPULAR_DECKS } from "@/lib/constants/top-decks";
import { proDeckOptions, proMapOptions } from "./options";

const hero = (heroId: string, tier: HeroListing["tier"], deckSection: HeroListing["deckSection"]): HeroListing =>
  ({ heroId, name: `${heroId} `, hp: 1, move: 1, reach: "MELEE", tier, deckSection }) as HeroListing;

describe("tournament pickers", () => {
  it("matches the picker: hides lab (server tier or deck table) and reflavored; keeps spice, balanced, community", () => {
    const out = proDeckOptions([
      hero("a", "community", "recommended"),
      hero("b", "community", "community"),
      hero("c", "lab", "community"),
      hero("d-spice", "spice", "recommended"),
      hero("e", "reflavored", "recommended"),
    ]);
    expect(out.map((d) => [d.heroId, d.section, d.name])).toEqual([
      ["a", "balanced", "a"],
      ["b", "community", "b"],
      ["d-spice", "balanced", "d-spice"],
    ]);
  });
  it("drops the heroes the player picker treats as lab, spice decks stay", () => {
    const labs = ["batman", "clone-troopers", "doppelganger", "appa", "the-narrator"];
    const spice = ["king-taranis-spice", "piper-of-the-underroads-spice", "the-hollow-oak-spice", "thetis-spice"];
    const out = proDeckOptions([...labs, ...spice, "kenshiro"].map((id) => hero(id, "community", "recommended")));
    expect(out.map((d) => d.heroId).sort()).toEqual([...spice, "kenshiro"].sort());
  });
  it("lists Pro catalog maps only, never the hidden arena", () => {
    const maps = proMapOptions();
    expect(maps.length).toBeGreaterThan(0);
    expect(maps.every((m) => m.ref.kind === "catalog")).toBe(true);
  });
});
