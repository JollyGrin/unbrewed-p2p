/** Seeding reorder + the PUT …/seeds payload (#1217). */
import { fixtureEntries } from "./fixtures";
import type { Entry } from "./types";
import {
  hasSavedSeeds,
  initialSeedOrder,
  moveSeed,
  opponentOfSeed,
  roundOnePairs,
  seedPayload,
  shuffleSeeds,
} from "./seeding";

const six = fixtureEntries(6, false);

describe("initialSeedOrder", () => {
  it("uses join order until every active entry has a seed", () => {
    expect(initialSeedOrder(six)).toEqual(["e1", "e2", "e3", "e4", "e5", "e6"]);
    expect(hasSavedSeeds(six)).toBe(false);
  });
  it("uses saved seeds, and drops entrants who left", () => {
    const saved: Entry[] = six.map((e, i) => ({ ...e, seed: 6 - i }));
    saved[0] = { ...saved[0], leftAt: "2026-10-03T00:00:00Z", seed: null };
    expect(hasSavedSeeds(saved)).toBe(true);
    expect(initialSeedOrder(saved)).toEqual(["e6", "e5", "e4", "e3", "e2"]);
  });
});

describe("moveSeed", () => {
  const order = ["a", "b", "c", "d"];
  it("drags down and up", () => {
    expect(moveSeed(order, 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveSeed(order, 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(moveSeed(order, 1, 1)).toEqual(order);
  });
  it("clamps out-of-range targets and never mutates", () => {
    expect(moveSeed(order, 0, 99)).toEqual(["b", "c", "d", "a"]);
    expect(moveSeed(order, 9, 0)).toEqual(order);
    expect(order).toEqual(["a", "b", "c", "d"]);
  });
});

describe("seedPayload", () => {
  it("is every active entry exactly once, best seed first", () => {
    const order = moveSeed(initialSeedOrder(six), 5, 0);
    expect(seedPayload(order, six)).toEqual({ order: ["e6", "e1", "e2", "e3", "e4", "e5"] });
  });
  it("refuses a stale list: missing, extra, duplicate or left entrants", () => {
    expect(seedPayload(["e1", "e2", "e3", "e4", "e5"], six)).toBeNull();
    expect(seedPayload(["e1", "e2", "e3", "e4", "e5", "e6", "e7"], six)).toBeNull();
    expect(seedPayload(["e1", "e1", "e3", "e4", "e5", "e6"], six)).toBeNull();
    const left = six.map((e) => (e.id === "e2" ? { ...e, leftAt: "2026-10-03T00:00:00Z" } : e));
    expect(seedPayload(["e1", "e2", "e3", "e4", "e5", "e6"], left)).toBeNull();
    expect(seedPayload(["e1", "e3", "e4", "e5", "e6"], left)).toEqual({ order: ["e1", "e3", "e4", "e5", "e6"] });
  });
  it("keeps a shuffle a permutation", () => {
    let i = 0;
    const rng = () => [0.9, 0.1, 0.5, 0.3, 0.7][i++ % 5];
    const order = shuffleSeeds(initialSeedOrder(six), rng);
    expect(seedPayload(order, six)?.order).toHaveLength(6);
  });
});

describe("round-1 pairings", () => {
  it("gives the top seeds the byes", () => {
    expect(roundOnePairs(8, 6)).toEqual([[1, null], [4, 5], [2, null], [3, 6]]);
    expect(opponentOfSeed(1, 8, 8)).toBe(8);
    expect(opponentOfSeed(1, 8, 6)).toBeNull();
    expect(opponentOfSeed(6, 8, 6)).toBe(3);
  });
});
