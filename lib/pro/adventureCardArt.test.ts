import { ADVENTURE_CARD_CDN_BASE, ENEMY_ART, adventureCardArt, conventionArtUrl, adventureEnemyTokenArt } from "./adventureCardArt";

const B = ADVENTURE_CARD_CDN_BASE;

describe("adventureCardArt", () => {
  it("resolves every previously-mapped card to the same URL", () => {
    const was: Record<string, string> = {
      "indominus-rex": "irex/irex-initiative",
      "indominus-rex/exaggerated-predator-traits": "irex/irex-alt-exaggerated-predator-traits",
      "indominus-rex/genetic-abomination": "irex/irex-alt-genetic-abomination",
      "indominus-rex/killing-for-sport": "irex/irex-alt-killing-for-sport",
      "indominus-rex/bigger-louder-more-teeth": "irex/irex-bigger",
      "indominus-rex/learning-her-place-in-the-food-chain": "irex/irex-learning",
      "indominus-rex/deception": "irex/irex-deception",
    };
    for (const [id, slug] of Object.entries(was)) expect(adventureCardArt(id)).toBe(`${B}/${slug}.webp`);
  });
  it("ignores #n / @fighter suffixes", () => {
    const url = `${B}/irex/irex-bigger.webp`;
    expect(adventureCardArt("indominus-rex/bigger-louder-more-teeth#2")).toBe(url);
    expect(adventureCardArt("indominus-rex@e1")).toBe(`${B}/irex/irex-initiative.webp`);
  });
  it("returns null for ids with no art (text face stays) — Heist enemies, unknown cards", () => {
    expect(adventureCardArt("gear-rat/anything")).toBeNull();
    expect(adventureCardArt("cog-sentry")).toBeNull();
    expect(adventureCardArt("ironclad-warden/some-card")).toBeNull();
    expect(adventureCardArt("indominus-rex/not-uploaded")).toBeNull();
    expect(adventureCardArt(null)).toBeNull();
    expect(adventureEnemyTokenArt("indominus-rex")).toBeNull();
  });
  it("follows the convention <base>/<dir>/<prefix>-<stem>.webp for every listed stem", () => {
    for (const [enemy, art] of Object.entries(ENEMY_ART)) {
      for (const stem of art.stems) {
        expect(stem).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      }
      expect(adventureCardArt(enemy)).toBe(
        art.stems.includes("initiative")
          ? `https://cdn.unbrewed.xyz/p2p/adventures/${art.scenario}/cards/${art.dir}/${art.prefix}-initiative.webp`
          : null,
      );
    }
  });
  it("the pure convention for an enemy with no inventory entry is <base>/<enemy>/<slug>.webp", () => {
    expect(ENEMY_ART["gear-rat"]).toBeUndefined();
    expect(conventionArtUrl("jurassic-park", "gear-rat", "wrench-swing")).toBe(`${B}/gear-rat/wrench-swing.webp`);
    // ...but it is never handed to a renderer without an inventory entry (no broken images)
    expect(adventureCardArt("gear-rat/wrench-swing")).toBeNull();
  });
});
