import { HERO_DECK_IDS } from "@/lib/pro/useProCardArt";

import { heroDisplayName, heroInitials, HIDDEN_HERO_NAMES, PUBLIC_ROSTER, ROSTER_SIZE } from "./roster";

describe("public roster", () => {
  it("is HERO_DECK_IDS minus the four reflavored baselines", () => {
    const deckHeroes = Object.keys(HERO_DECK_IDS).sort();
    const roster = PUBLIC_ROSTER.map((h) => h.heroId);
    const hidden = Object.keys(HIDDEN_HERO_NAMES);
    expect([...roster, ...hidden].sort()).toEqual(deckHeroes);
    expect(ROSTER_SIZE).toBe(33);
    expect(new Set(roster).size).toBe(roster.length);
  });

  it("names heroes, falling back to the sent name then the id", () => {
    expect(heroDisplayName("thetis-spice")).toBe("Thetis");
    expect(heroDisplayName("thetis")).toBe("Thetis");
    expect(heroDisplayName("brand-new", "Brand New")).toBe("Brand New");
    expect(heroDisplayName("brand-new")).toBe("brand-new");
    expect(heroDisplayName(null)).toBe("Unknown hero");
  });

  it("makes two-letter initials", () => {
    expect(heroInitials("Specter Knight")).toBe("SK");
    expect(heroInitials("Nancy Drew")).toBe("ND");
    expect(heroInitials("Thrall")).toBe("TH");
    expect(heroInitials("R2-D2")).toBe("RD");
  });
});
