import type { HeroListing } from "@/lib/pro/protocol";
import { proDeckOptions, proMapOptions } from "./options";

const hero = (heroId: string, tier: HeroListing["tier"], deckSection: HeroListing["deckSection"]): HeroListing =>
  ({ heroId, name: `${heroId} `, hp: 1, move: 1, reach: "MELEE", tier, deckSection }) as HeroListing;

describe("tournament pickers", () => {
  it("hides lab, spice and reflavored decks; keeps balanced + community", () => {
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
    ]);
  });
  it("lists Pro catalog maps only, never the hidden arena", () => {
    const maps = proMapOptions();
    expect(maps.length).toBeGreaterThan(0);
    expect(maps.every((m) => m.ref.kind === "catalog")).toBe(true);
  });
});
