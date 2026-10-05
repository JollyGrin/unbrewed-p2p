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
  it("drops a hero the client deck table marks lab, even when the server tier says otherwise", () => {
    const labId = POPULAR_DECKS.find((d) => d.lab)?.id;
    expect(labId).toBeDefined();
    expect(proDeckOptions([hero(labId as string, "community", "recommended")])).toEqual([]);
  });
  it("lists Pro catalog maps only, never the hidden arena", () => {
    const maps = proMapOptions();
    expect(maps.length).toBeGreaterThan(0);
    expect(maps.every((m) => m.ref.kind === "catalog")).toBe(true);
  });
});
