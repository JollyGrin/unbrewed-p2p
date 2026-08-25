import { RANDOM_HERO_ID, resolveHeroPick, rollRandomHero } from "./randomHero";
import type { HeroListing } from "./protocol";

const hero = (heroId: string): HeroListing => ({
  heroId,
  name: heroId,
  hp: 12,
  move: 3,
  reach: "MELEE",
  tier: "spice",
  deckSection: "recommended",
});

const POOL = ["a", "b", "c", "d"].map(hero);

describe("rollRandomHero", () => {
  it("reaches every fighter in the pool, uniformly", () => {
    expect(POOL.map((_, i) => rollRandomHero(POOL, () => i / POOL.length)!.heroId)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("stays inside the pool for a degenerate rng", () => {
    // Math.random() is [0,1), but a broken rng must not index past the end
    expect(rollRandomHero(POOL, () => 1)!.heroId).toBe("d");
    expect(rollRandomHero(POOL, () => 0)!.heroId).toBe("a");
    expect(rollRandomHero(POOL, () => -1)!.heroId).toBe("a");
  });

  it("returns null when there is nothing to roll", () => {
    expect(rollRandomHero([], () => 0.5)).toBeNull();
  });

  it("returns the only fighter when one survives the filters", () => {
    expect(rollRandomHero([hero("solo")], () => 0.99)!.heroId).toBe("solo");
  });
});

describe("resolveHeroPick", () => {
  it("passes a hand-picked fighter through untouched", () => {
    // …and never consults the rng, so a hand pick can't be silently rerolled
    const rng = jest.fn(() => 0.5);
    expect(resolveHeroPick("king-kong", POOL, rng)).toBe("king-kong");
    expect(rng).not.toHaveBeenCalled();
  });

  it("passes a fighter through even when it is filtered out of the pool", () => {
    // Picking a fighter then typing an unrelated search must not lose the pick
    expect(resolveHeroPick("king-kong", [], () => 0)).toBe("king-kong");
  });

  it("resolves the Random sentinel against the pool", () => {
    expect(resolveHeroPick(RANDOM_HERO_ID, POOL, () => 0.5)).toBe("c");
  });

  it("rolls only over the pool it is given — the filtered roster", () => {
    const melee = [hero("b"), hero("d")];
    expect(resolveHeroPick(RANDOM_HERO_ID, melee, () => 0)).toBe("b");
    expect(resolveHeroPick(RANDOM_HERO_ID, melee, () => 0.99)).toBe("d");
  });

  it("is null with nothing picked, and null for Random with an empty pool", () => {
    expect(resolveHeroPick(null, POOL, () => 0)).toBeNull();
    expect(resolveHeroPick(RANDOM_HERO_ID, [], () => 0)).toBeNull();
  });

  it("never returns the sentinel itself", () => {
    for (let i = 0; i < POOL.length; i++) {
      expect(resolveHeroPick(RANDOM_HERO_ID, POOL, () => i / POOL.length)).not.toBe(RANDOM_HERO_ID);
    }
  });
});
