import {
  ADVENTURE_CARD_CDN_BASE,
  ADVENTURE_CARD_SLUGS,
  adventureCardArt,
  adventureEnemyTokenArt,
} from "./adventureCardArt";

describe("adventureCardArt", () => {
  it("routes a known id to its CDN webp, ignoring #n / @fighter suffixes", () => {
    const url = `${ADVENTURE_CARD_CDN_BASE}/irex/irex-bigger.webp`;
    expect(adventureCardArt("indominus-rex/bigger-louder-more-teeth")).toBe(url);
    expect(adventureCardArt("indominus-rex/bigger-louder-more-teeth#2")).toBe(url);
    expect(adventureCardArt("indominus-rex@e1")).toBe(`${ADVENTURE_CARD_CDN_BASE}/irex/irex-initiative.webp`);
  });
  it("returns null for ids with no art (placeholder stays)", () => {
    expect(adventureCardArt("gear-rat/anything")).toBeNull();
    expect(adventureCardArt(null)).toBeNull();
    expect(adventureEnemyTokenArt("indominus-rex")).toBeNull();
  });
  it("only maps to the uploaded irex slugs", () => {
    expect(Object.values(ADVENTURE_CARD_SLUGS).every((s) => /^irex\/irex-[a-z-]+$/.test(s))).toBe(true);
  });
});
