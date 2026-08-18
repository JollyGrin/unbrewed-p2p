/**
 * The cosmetic ladder's data layer (#613, design doc §5/§9b/§10a). These lock
 * the two rules that keep a cosmetic from ever being mistaken for game state —
 * multi-stop material, never an animated hue — and the "fail silently to plain"
 * contract of the debug equip registry.
 */
import {
  COSMETICS_DEBUG_KEY,
  COSMETIC_RIM_PAINTS,
  COSMETIC_RIM_TIERS,
  __resetCosmeticsForTest,
  cosmeticEquipFor,
  isCosmeticRimTier,
  readCosmeticsDebug,
} from "./cosmetics";

const equip = (registry: unknown) => {
  window.localStorage.setItem(COSMETICS_DEBUG_KEY, JSON.stringify(registry));
  __resetCosmeticsForTest();
};

beforeEach(() => {
  window.localStorage.removeItem(COSMETICS_DEBUG_KEY);
  __resetCosmeticsForTest();
});

describe("the rim ladder", () => {
  it("is four ordered tiers, bronze at the bottom and iridescent at the top", () => {
    expect(COSMETIC_RIM_TIERS).toEqual(["bronze", "silver", "gold", "iridescent"]);
  });

  it("paints every tier as a MULTI-stop gradient — a flat hue at an edge is game state (§9b)", () => {
    for (const tier of COSMETIC_RIM_TIERS) {
      const { ring } = COSMETIC_RIM_PAINTS[tier];
      expect(ring).toMatch(/^conic-gradient\(/);
      // 3+ colour stops is the floor for reading as material rather than signal.
      expect((ring.match(/#[0-9a-f]{6}/gi) ?? []).length).toBeGreaterThanOrEqual(3);
    }
  });

  it("never animates — a hue cycle passes through every signal colour each loop (§9b/§10b)", () => {
    for (const tier of COSMETIC_RIM_TIERS) {
      expect(COSMETIC_RIM_PAINTS[tier].ring).not.toMatch(/animation|hue-rotate|@keyframes|infinite/i);
    }
  });

  it("keeps the tier-3 gold ANTIQUED — never the seat/target gold #E0A82E (§10b)", () => {
    expect(COSMETIC_RIM_PAINTS.gold.ring.toLowerCase()).not.toContain("e0a82e");
    // …nor any of the other three seat hues, on any tier.
    for (const seat of ["#e0a82e", "#3b8beb", "#2f9e68", "#c0449e", "#39b7a8"]) {
      for (const tier of COSMETIC_RIM_TIERS) {
        expect(COSMETIC_RIM_PAINTS[tier].ring.toLowerCase()).not.toContain(seat);
      }
    }
  });

  it("accepts only real tier names", () => {
    expect(isCosmeticRimTier("gold")).toBe(true);
    expect(isCosmeticRimTier("GOLD")).toBe(false);
    expect(isCosmeticRimTier("platinum")).toBe(false);
    expect(isCosmeticRimTier(3)).toBe(false);
    expect(isCosmeticRimTier(null)).toBe(false);
  });
});

describe("the debug equip registry", () => {
  it("is empty when nothing is equipped", () => {
    expect(readCosmeticsDebug()).toEqual({});
    expect(cosmeticEquipFor("thetis")).toEqual({});
  });

  it("resolves an equipped token rim by hero id, case-insensitively", () => {
    equip({ thetis: { tokenRim: "silver" } });
    expect(cosmeticEquipFor("thetis").tokenRim).toBe("silver");
    expect(cosmeticEquipFor("  Thetis ").tokenRim).toBe("silver");
  });

  it("carries the card slot beside the token slot without either reading the other", () => {
    equip({ thetis: { tokenRim: "bronze", cardRim: "iridescent" } });
    expect(cosmeticEquipFor("thetis")).toEqual({ tokenRim: "bronze", cardRim: "iridescent" });
  });

  it("lets a -spice remix inherit its base hero's equip", () => {
    equip({ thetis: { tokenRim: "gold" } });
    expect(cosmeticEquipFor("thetis-spice").tokenRim).toBe("gold");
  });

  it("prefers a remix's OWN entry over the base hero's", () => {
    equip({ thetis: { tokenRim: "gold" }, "thetis-spice": { tokenRim: "bronze" } });
    expect(cosmeticEquipFor("thetis-spice").tokenRim).toBe("bronze");
  });

  it("falls silently back to plain for an unknown hero, tier, or missing id", () => {
    equip({ thetis: { tokenRim: "platinum" }, piper: { tokenRim: 7 } });
    expect(cosmeticEquipFor("thetis").tokenRim).toBeUndefined();
    expect(cosmeticEquipFor("piper").tokenRim).toBeUndefined();
    expect(cosmeticEquipFor("king-kong").tokenRim).toBeUndefined();
    expect(cosmeticEquipFor(undefined).tokenRim).toBeUndefined();
    expect(cosmeticEquipFor(null).tokenRim).toBeUndefined();
  });

  it("survives malformed storage without throwing", () => {
    for (const raw of ["", "not json", "[]", '"gold"', "null", '{"thetis":"gold"}']) {
      window.localStorage.setItem(COSMETICS_DEBUG_KEY, raw);
      __resetCosmeticsForTest();
      expect(() => readCosmeticsDebug()).not.toThrow();
      expect(cosmeticEquipFor("thetis")).toEqual({});
    }
  });
});
