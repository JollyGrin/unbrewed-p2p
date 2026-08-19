/**
 * The cosmetic ladder's data layer (#613 tokens, #612 cards; design doc
 * §5/§9b/§10a). These lock the two rules that keep a cosmetic from ever being
 * mistaken for game state — multi-stop material, never an animated hue — and
 * the "fail silently to plain" contract of the debug equip registry.
 *
 * The card slot (#612) is PER CARD, so its fixtures are always mixed: some
 * cards upgraded, at different tiers, some deliberately left at base art. A
 * uniform fixture passes while the per-card lookup is broken.
 */
import {
  COSMETICS_DEBUG_KEY,
  COSMETIC_RIM_PAINTS,
  COSMETIC_RIM_STOPS,
  COSMETIC_RIM_TIERS,
  __resetCosmeticsForTest,
  cardRimFor,
  cosmeticEquipFor,
  isCosmeticRimTier,
  readCosmeticsDebug,
} from "./cosmetics";
import { norm } from "./cardAppearance";

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
    equip({ thetis: { tokenRim: "bronze", cards: { feint: "iridescent" } } });
    expect(cosmeticEquipFor("thetis")).toEqual({
      tokenRim: "bronze",
      cards: { feint: "iridescent" },
    });
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

// --- the per-card slot (#612) ----------------------------------------------

/** Mixed on purpose: three tiers equipped on Kenshiro, one card left at base
 *  art, and a second hero sharing one of the titles. */
const MIXED = {
  kenshiro: {
    cards: {
      "hundred crack fist": "iridescent",
      feint: "silver",
      "north star": "bronze",
      // "Battle Aura" absent — base art.
    },
  },
  "king-taranis": { cards: { feint: "gold" } },
};

describe("the per-card rim slot", () => {
  it("answers per card, not per deck", () => {
    equip(MIXED);
    expect(cardRimFor("kenshiro", "Hundred Crack Fist")).toBe("iridescent");
    expect(cardRimFor("kenshiro", "Feint")).toBe("silver");
    expect(cardRimFor("kenshiro", "North Star")).toBe("bronze");
    // Same deck, not upgraded — base art.
    expect(cardRimFor("kenshiro", "Battle Aura")).toBeNull();
  });

  it("never crosses heroes for the same title", () => {
    equip(MIXED);
    expect(cardRimFor("kenshiro", "Feint")).toBe("silver");
    expect(cardRimFor("king-taranis", "Feint")).toBe("gold");
    expect(cardRimFor("nobody", "Feint")).toBeNull();
  });

  it("normalizes titles exactly like the art index, so a rim can't miss its card", () => {
    equip({ kenshiro: { cards: { "  HUNDRED CRACK FIST ": "gold" } } });
    expect(cardRimFor("kenshiro", "Hundred Crack Fist")).toBe("gold");
    expect(cardRimFor("kenshiro", norm(" Hundred Crack Fist "))).toBe("gold");
  });

  it("lets a -spice remix inherit its base hero's card rims", () => {
    equip(MIXED);
    expect(cardRimFor("kenshiro-spice", "Feint")).toBe("silver");
  });

  it("drops only the bad entries, never the rest of the hero's rims", () => {
    equip({
      kenshiro: {
        cards: { feint: "silver", "not a tier": "platinum", nope: 3, gone: null },
      },
    });
    expect(cosmeticEquipFor("kenshiro").cards).toEqual({ feint: "silver" });
  });

  it.each([
    ["an array", { kenshiro: { cards: ["feint"] } }],
    ["a string", { kenshiro: { cards: "gold" } }],
    ["all-invalid tiers", { kenshiro: { cards: { feint: "platinum" } } }],
    ["an empty map", { kenshiro: { cards: {} } }],
  ])("falls back to plain when the card slot is %s", (_label, raw) => {
    equip(raw);
    expect(cosmeticEquipFor("kenshiro")).toEqual({});
    expect(cardRimFor("kenshiro", "Feint")).toBeNull();
  });

  it("is total — no registry, no hero and no title are all just 'no cosmetic'", () => {
    expect(cardRimFor("kenshiro", "Feint")).toBeNull();
    expect(cardRimFor(undefined, "Feint")).toBeNull();
    expect(cardRimFor(null, "Feint")).toBeNull();
    equip(MIXED);
    expect(cardRimFor("kenshiro", "No Such Card")).toBeNull();
  });
});

describe("COSMETIC_RIM_STOPS — the same paints for SVG consumers", () => {
  it("carries every colour of its conic paint, in the same order", () => {
    for (const tier of COSMETIC_RIM_TIERS) {
      const fromPaint = (
        COSMETIC_RIM_PAINTS[tier].ring.match(/#[0-9a-f]{6}/gi) ?? []
      ).map((c) => c.toLowerCase());
      expect(
        COSMETIC_RIM_STOPS[tier].map((s) => s.color.toLowerCase()),
      ).toEqual(fromPaint);
    }
  });

  it("keeps offsets inside 0..1 and ascending — a valid SVG gradient", () => {
    for (const tier of COSMETIC_RIM_TIERS) {
      const offsets = COSMETIC_RIM_STOPS[tier].map((s) => s.offset);
      expect(offsets.length).toBeGreaterThanOrEqual(5);
      expect(offsets[0]).toBe(0);
      expect(offsets[offsets.length - 1]).toBe(1);
      for (let i = 1; i < offsets.length; i++) {
        expect(offsets[i]).toBeGreaterThanOrEqual(offsets[i - 1]);
        expect(offsets[i]).toBeLessThanOrEqual(1);
      }
    }
  });

  it("stays multi-stop per tier — a flat rim at an edge would read as game state", () => {
    for (const tier of COSMETIC_RIM_TIERS) {
      const colors = new Set(
        COSMETIC_RIM_STOPS[tier].map((s) => s.color.toLowerCase()),
      );
      expect(colors.size).toBeGreaterThanOrEqual(5);
    }
  });

  it("keeps antiqued gold measurably clear of the playable ring #E0A82E", () => {
    const rgb = (hex: string) => [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ];
    const dist = (a: number[], b: number[]) =>
      Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const ring = rgb("#E0A82E");
    const stops = COSMETIC_RIM_STOPS.gold.map((s) => rgb(s.color));
    // No single stop may even approach the ring colour...
    for (const stop of stops) expect(dist(stop, ring)).toBeGreaterThan(35);
    // ...and the rim's overall read (its mean) is far darker and browner, which
    // is what "antiqued" buys over a bright gold.
    const mean = [0, 1, 2].map(
      (i) => stops.reduce((sum, s) => sum + s[i], 0) / stops.length,
    );
    expect(dist(mean, ring)).toBeGreaterThan(90);
  });
});
