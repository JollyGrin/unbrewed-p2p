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
          ? `https://cdn.unbrewed.xyz/p2p/adventures/${art.scenario}/cards/${art.dir}/${art.prefix ? `${art.prefix}-` : ""}initiative.webp`
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

  describe("Isla Nublar minions (#1367)", () => {
    // every upload, as `<enemy id>` or `<enemy id>/<slug>` -> `<dir>/<file>` (61 faces)
    const MINIONS: Record<string, string[]> = {
      ankylosaurus: ["armored-plates", "deception", "fused-lizard", "living-tank"],
      apatosaurus: ["deceptive-lizard", "hulking-sauropod", "lumbering-titan", "sweeping-tail", "unbothered-grazing"],
      carnotaurus: ["back-into-the-brush", "deception", "highly-aggressive", "meat-eating-bull"],
      dilophosaurus: ["blinding-venom", "deception", "savage-hunter", "two-crested-lizard"],
      gallimimus: ["across-the-open-field", "deception", "flight-response", "thunder-on-the-plains", "trampled"],
      oviraptor: ["deception", "egg-thief", "hit-and-run", "outmaneuver", "silent-heist"],
      parasaurolophus: ["deception", "hadrosaur-stampede", "near-crested-lizard", "warning-call"],
      stygimoloch: ["deception", "demon-from-the-river-styx", "momentum", "shattering-impact"],
      therizinosaurus: ["deception", "looming-dread", "primordial-harvest", "reaping-talons", "scythe-lizard"],
      "triceratops-minion": ["deception", "gore", "herd-protection", "three-horned-face"],
      tyrannosaurus: ["bone-crushing-jaws", "deception", "drawn-to-movement", "primordial-roar", "thrash", "tyrant-queen"],
    };
    it("resolves all 61 faces (50 combat + 11 initiative) to <dir>/<slug>.webp", () => {
      let n = 0;
      for (const [enemy, slugs] of Object.entries(MINIONS)) {
        expect(adventureCardArt(enemy)).toBe(`${B}/${enemy}/initiative.webp`);
        n++;
        for (const slug of slugs) {
          expect(adventureCardArt(`${enemy}/${slug}`)).toBe(`${B}/${enemy}/${slug}.webp`);
          n++;
        }
      }
      expect(n).toBe(61);
    });
    it("a released asset's initiative (bare <dino>-asset id) shows the minion's initiative face", () => {
      expect(adventureCardArt("therizinosaurus-asset")).toBe(`${B}/therizinosaurus/initiative.webp`);
      expect(adventureCardArt("triceratops-asset")).toBe(`${B}/triceratops-minion/initiative.webp`);
      expect(adventureCardArt("tyrannosaurus-asset@e3")).toBe(`${B}/tyrannosaurus/initiative.webp`);
      for (const enemy of Object.keys(MINIONS)) {
        const asset = `${enemy.replace(/-minion$/, "")}-asset`;
        expect(adventureCardArt(asset)).toBe(`${B}/${enemy}/initiative.webp`);
      }
    });
    it("asset combat cards share the minion's ids and suffixes are stripped", () => {
      expect(adventureCardArt("therizinosaurus/reaping-talons#2")).toBe(`${B}/therizinosaurus/reaping-talons.webp`);
      expect(adventureCardArt("triceratops-minion/gore@e2")).toBe(`${B}/triceratops-minion/gore.webp`);
    });
    it("keeps the inventory guard: unlisted ids and the deferred dinosaurs stay null", () => {
      expect(adventureCardArt("therizinosaurus/not-a-card")).toBeNull();
      expect(adventureCardArt("therizinosaurus/rules")).toBeNull();
      expect(adventureCardArt("triceratops/gore")).toBeNull();
      expect(adventureCardArt("spinosaurus/anything")).toBeNull();
      expect(adventureCardArt("velociraptors-asset")).toBeNull();
      expect(adventureCardArt("quetzalcoatlus")).toBeNull();
      expect(adventureEnemyTokenArt("therizinosaurus")).toBeNull();
    });
  });
});
