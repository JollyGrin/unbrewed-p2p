import { matchCell, MatchCellInput, matchupLookup, maxCellGames, playerMatchupLookup } from "./matchGrid";

const base: MatchCellInput = {
  rowHeroId: "thrall",
  colHeroId: "appa",
  rowName: "Thrall",
  colName: "Appa",
  counts: null,
  mode: "games",
  maxGames: 64,
};

describe("matchCell", () => {
  it("leaves the diagonal blank", () => {
    const cell = matchCell({ ...base, colHeroId: "thrall", counts: { games: 9, wins: 4, draws: 0 } });
    expect(cell).toMatchObject({ kind: "diagonal", label: "", tip: "" });
  });

  it("shows · with a tooltip for an unplayed pair", () => {
    for (const mode of ["games", "winRate"] as const) {
      const cell = matchCell({ ...base, mode });
      expect(cell).toMatchObject({ kind: "empty", label: "·" });
      expect(cell.tip).toMatch(/not played/);
    }
  });

  it("scales games-mode alpha by the grid's max and flips ink on dark cells", () => {
    const full = matchCell({ ...base, counts: { games: 64, wins: 30, draws: 0 } });
    expect(full).toMatchObject({ label: "64", bg: "rgba(72,40,79,0.90)", ink: "#FAEBD7" });
    const light = matchCell({ ...base, counts: { games: 8, wins: 3, draws: 0 } });
    expect(light.bg).toBe(`rgba(72,40,79,${(0.08 + 0.82 * (8 / 64)).toFixed(2)})`);
    expect(light.ink).toBe("#48284F");
    expect(light.tip).toBe("Thrall vs Appa: 8 games");
  });

  it("needs 3 games for a win rate", () => {
    const thin = matchCell({ ...base, mode: "winRate", counts: { games: 2, wins: 2, draws: 0 } });
    expect(thin).toMatchObject({ kind: "thin", label: "·" });
    expect(thin.tip).toMatch(/fewer than 3/);
    const enough = matchCell({ ...base, mode: "winRate", counts: { games: 3, wins: 2, draws: 0 } });
    expect(enough).toMatchObject({ kind: "value", label: "67%" });
  });

  it("colours the row's side: green at ≥50%, red below, alpha clamped", () => {
    const even = matchCell({ ...base, mode: "winRate", counts: { games: 10, wins: 5, draws: 0 } });
    expect(even.bg).toBe("rgba(47,158,104,0.10)");
    const losing = matchCell({ ...base, mode: "winRate", counts: { games: 11, wins: 3, draws: 0 } });
    expect(losing.bg).toMatch(/^rgba\(255,99,71,/);
    const crushing = matchCell({ ...base, mode: "winRate", counts: { games: 10, wins: 10, draws: 0 } });
    expect(crushing.bg).toBe("rgba(47,158,104,0.75)");
    // Player gain 2.2 is softer than the community's 4.4 for the same record.
    const community = matchCell({ ...base, mode: "winRate", counts: { games: 10, wins: 6, draws: 0 } });
    const player = matchCell({ ...base, mode: "winRate", gain: 2.2, counts: { games: 10, wins: 6, draws: 0 } });
    expect(community.bg).toBe("rgba(47,158,104,0.44)");
    expect(player.bg).toBe("rgba(47,158,104,0.22)");
  });

  it("adds the 'w of g' sub-label on the player grid, even under 3 games", () => {
    expect(matchCell({ ...base, mode: "winRate", withSub: true, counts: { games: 11, wins: 3, draws: 0 } }).sub).toBe("3 of 11");
    expect(matchCell({ ...base, mode: "winRate", withSub: true, counts: { games: 1, wins: 1, draws: 0 } })).toMatchObject({ label: "·", sub: "1 of 1" });
  });
});

describe("lookups", () => {
  it("index community matchups by orientation and find the max off the diagonal", () => {
    const lookup = matchupLookup([
      { heroId: "a", opponentHeroId: "b", games: 5, wins: 2, draws: 0 },
      { heroId: "b", opponentHeroId: "a", games: 5, wins: 3, draws: 0 },
    ]);
    expect(lookup("b", "a")?.wins).toBe(3);
    expect(lookup("a", "c")).toBeNull();
    expect(maxCellGames(["a", "b"], ["a", "b"], lookup)).toBe(5);
  });

  it("merge duplicate player rows and skip null heroes", () => {
    const lookup = playerMatchupLookup([
      { heroId: "a", heroName: null, opponentHeroId: "b", opponentHeroName: null, games: 2, wins: 1, draws: 0 },
      { heroId: "a", heroName: null, opponentHeroId: "b", opponentHeroName: null, games: 3, wins: 3, draws: 0 },
      { heroId: null, heroName: null, opponentHeroId: "b", opponentHeroName: null, games: 9, wins: 9, draws: 0 },
    ]);
    expect(lookup("a", "b")).toEqual({ games: 5, wins: 4, draws: 0 });
  });
});
