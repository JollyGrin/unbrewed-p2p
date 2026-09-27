import { HERO_RANKS, heroRank, heroRankProgress } from "./heroRank";

describe("hero rank", () => {
  it.each([
    [0, null],
    [1, "Tried"],
    [4, "Tried"],
    [5, "Bronze"],
    [24, "Bronze"],
    [25, "Silver"],
    [99, "Silver"],
    [100, "Gold"],
    [5000, "Gold"],
  ])("%i games → %s", (games, name) => {
    expect(heroRank(games)?.name ?? null).toBe(name);
  });

  it("uses the design's thresholds and ring colours", () => {
    expect(HERO_RANKS.map((r) => [r.name, r.minGames, r.ring])).toEqual([
      ["Tried", 1, "#8A4FA0"],
      ["Bronze", 5, "#A8623A"],
      ["Silver", 25, "#8D8794"],
      ["Gold", 100, "#E0A82E"],
    ]);
  });

  it("counts games to the next rank", () => {
    expect(heroRankProgress(24)).toMatchObject({ rank: { name: "Bronze" }, next: { name: "Silver" }, toNext: 1 });
    expect(heroRankProgress(0)).toMatchObject({ rank: null, next: { name: "Tried" }, toNext: 1 });
    expect(heroRankProgress(100)).toMatchObject({ rank: { name: "Gold" }, next: null, toNext: 0 });
  });
});
