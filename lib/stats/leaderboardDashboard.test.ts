/**
 * /leaderboard dashboard derivations (#936): window parsing, ranks and gaps
 * in both windows, the podium order, the band's fallbacks, the featured
 * heroes and pairs, and every "hidden when absent" answer.
 */
import { fixtureCommunity, fixtureLeaderboard } from "./fixtures";
import {
  chaseCaption,
  chaseRows,
  heroesInPlayCount,
  humanVsExpertLine,
  mostPlayedPair,
  neverPlayedPair,
  pairSplitPhrase,
  parseWindow,
  playersRankedValue,
  podium,
  topHeroes,
  windowQuery,
  winsFor,
} from "./leaderboardDashboard";
import { normalizeCommunity, normalizeStatsLeaderboard } from "./normalize";
import type { Community, CommunityHero, Matchup, StatsLeaderboard, StatsLeaderboardRow } from "./types";

const row = (over: Partial<StatsLeaderboardRow>): StatsLeaderboardRow => ({
  rank: 1,
  username: "a",
  avatarUrl: null,
  level: 1,
  xp: 0,
  selectedBadge: null,
  gamesPlayed: 0,
  wins: 0,
  mainHeroId: null,
  mainHeroName: null,
  recentForm: null,
  currentStreak: null,
  monthGames: null,
  monthWins: null,
  ...over,
});

const hero = (heroId: string, games: number): CommunityHero => ({
  heroId,
  heroName: null,
  games,
  wins: 0,
  draws: 0,
  crown: null,
});

const emptyCommunity: Community = {
  window: "month",
  windowStart: null,
  generatedAt: null,
  totals: null,
  weekly: null,
  heroes: null,
  matchups: null,
  playersRanked: null,
};

describe("window", () => {
  it("defaults to this month; only ?window=all means all time", () => {
    expect(parseWindow(undefined)).toBe("month");
    expect(parseWindow("month")).toBe("month");
    expect(parseWindow("bogus")).toBe("month");
    expect(parseWindow("all")).toBe("all");
    expect(parseWindow(["all", "month"])).toBe("all");
  });

  it("keeps the default out of the URL", () => {
    expect(windowQuery("month")).toEqual({});
    expect(windowQuery("all")).toEqual({ window: "all" });
  });
});

describe("chase rows", () => {
  const players = [
    row({ rank: 1, username: "a", xp: 1000, wins: 50, monthWins: 20, monthGames: 30 }),
    row({ rank: 2, username: "b", xp: 900, wins: 60, monthWins: 20, monthGames: 25 }),
    row({ rank: 3, username: "c", xp: 400, wins: 10, monthWins: 5, monthGames: 9 }),
  ];

  it("gaps are XP to the row above, in api order", () => {
    const chase = chaseRows(players, "all");
    expect(chase.map((c) => c.gap)).toEqual([0, 100, 500]);
    expect(chase[0].above).toBeNull();
    expect(chase[2].above?.username).toBe("b");
    expect(chase[2].progress).toBeCloseTo(400 / 900);
    expect(chaseCaption(chase[2], "all")).toBe("400 XP · 500 behind #2");
    expect(chaseCaption(chase[0], "all")).toBe("1,000 XP");
  });

  it("month gaps use month wins, and a tie reads 'level with'", () => {
    const chase = chaseRows(players, "month");
    expect(chaseCaption(chase[1], "month")).toBe("20 wins this month · level with #1");
    expect(chaseCaption(chase[2], "month")).toBe("5 wins this month · 15 behind #2");
  });

  it("wins shown follow the window", () => {
    expect(winsFor(players[0], "all")).toBe(50);
    expect(winsFor(players[0], "month")).toBe(20);
    // An older api on the month board: fall back rather than print 0.
    expect(winsFor(row({ wins: 7 }), "month")).toBe(7);
  });

  it("the fixture month board ranks by month wins and gaps accordingly", () => {
    const board = normalizeStatsLeaderboard(fixtureLeaderboard(200, "month"), "month");
    const chase = chaseRows(board.players, "month");
    for (const c of chase) expect(c.gap).toBeGreaterThanOrEqual(0);
    expect(board.players[0].username).toBe("TinCanTom");
  });
});

describe("podium", () => {
  it("is the top three, drawn 2 · 1 · 3 on desktop", () => {
    const players = ["a", "b", "c", "d"].map((u, i) => row({ username: u, rank: i + 1 }));
    expect(podium(players).map((p) => [p.row.username, p.place, p.desktopOrder])).toEqual([
      ["a", 1, 2],
      ["b", 2, 1],
      ["c", 3, 3],
    ]);
    expect(podium(players.slice(0, 1))).toHaveLength(1);
  });
});

describe("band tiles", () => {
  const board = (over: Partial<StatsLeaderboard>): StatsLeaderboard => ({
    window: "all",
    generatedAt: null,
    total: null,
    players: [row({}), row({ username: "b" })],
    ...over,
  });

  it("players ranked: community, then total, then a short board's length, else hidden", () => {
    expect(playersRankedValue({ ...emptyCommunity, playersRanked: 214 }, board({ total: 9 }))).toBe(214);
    expect(playersRankedValue(null, board({ total: 9 }))).toBe(9);
    expect(playersRankedValue(null, board({}))).toBe(2);
    expect(playersRankedValue(null, board({}), 2)).toBeNull();
    expect(playersRankedValue(null, null)).toBeNull();
  });

  it("heroes in play counts public-roster heroes only; null when not sent", () => {
    expect(heroesInPlayCount(null)).toBeNull();
    expect(heroesInPlayCount([hero("the-mandalorian", 3), hero("hollow-oak", 2), hero("hollow-oak-spice", 1)])).toBe(2);
  });
});

describe("table talk", () => {
  const withSplit = (games: number, wins: number): Community => ({
    ...emptyCommunity,
    totals: { human: 1, hardExpert: 1, casual: 1, games: 3, humanVsExpert: { games, wins } },
  });

  it("says the expert-bot line with the window's wording", () => {
    expect(humanVsExpertLine(withSplit(410, 287), "month")).toBe(
      "Humans beat the expert bot in 70% of games this month.",
    );
    expect(humanVsExpertLine(withSplit(10, 5), "all")).toBe("Humans beat the expert bot in 50% of games all time.");
  });

  it("hides it under 10 games or when absent", () => {
    expect(humanVsExpertLine(withSplit(9, 9), "month")).toBeNull();
    expect(humanVsExpertLine(emptyCommunity, "month")).toBeNull();
    expect(humanVsExpertLine(null, "month")).toBeNull();
  });
});

describe("heroes and pairs", () => {
  const m = (heroId: string, opponentHeroId: string, games: number, wins: number, draws = 0): Matchup => ({
    heroId,
    opponentHeroId,
    games,
    wins,
    draws,
  });

  it("top heroes sorts by games then id and drops zeros", () => {
    const heroes = [hero("b", 5), hero("a", 5), hero("c", 9), hero("z", 0)];
    expect(topHeroes(heroes, 3).map((h) => h.heroId)).toEqual(["c", "a", "b"]);
    expect(topHeroes(null, 3)).toEqual([]);
  });

  it("most played pair reads each side's wins, from either orientation", () => {
    const heroes = [hero("a", 9), hero("b", 8), hero("c", 7)];
    const pick = mostPlayedPair(heroes, [m("a", "b", 10, 6), m("b", "a", 10, 4), m("c", "a", 12, 5, 1)]);
    expect(pick && [pick.a.heroId, pick.b.heroId, pick.winsA, pick.winsB]).toEqual(["a", "c", 6, 5]);
    expect(pick && pairSplitPhrase(pick)).toBe("12 games, split 6 to 5, 1 drawn");
    expect(mostPlayedPair(heroes, [])).toBeNull();
  });

  it("never-played is the first empty pair in grid order, or null", () => {
    const heroes = [hero("a", 9), hero("b", 8), hero("c", 7)];
    expect(neverPlayedPair(heroes, [m("a", "b", 1, 1)])?.map((h) => h.heroId)).toEqual(["a", "c"]);
    expect(neverPlayedPair(heroes, [m("a", "b", 1, 1), m("c", "a", 1, 0), m("b", "c", 2, 1)])).toBeNull();
  });

  it("the fixtures feature Mandalorian vs Boba Fett and the unplayed Baba Yaga vs Kenshiro", () => {
    const community = normalizeCommunity(fixtureCommunity("month"), "month");
    const heroes = topHeroes(community.heroes, 10);
    const busiest = mostPlayedPair(heroes, community.matchups ?? []);
    expect(busiest && [busiest.a.heroId, busiest.b.heroId, busiest.games]).toEqual(["the-mandalorian", "boba-fett", 64]);
    expect(neverPlayedPair(heroes, community.matchups ?? [])?.map((h) => h.heroId)).toEqual(["baba-yaga", "kenshiro"]);
  });
});
