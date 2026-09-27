/**
 * The stats normalisers (#935): every field the train ADDS is null when the api
 * doesn't send it — today's prod sends none of them — and malformed rows are
 * dropped rather than rendered.
 */
import {
  normalizeCommunity,
  normalizeHero,
  normalizeStatsLeaderboard,
  normalizeStatsPlayer,
} from "./normalize";

describe("normalizeCommunity", () => {
  it("turns every absent section into null", () => {
    const c = normalizeCommunity({}, "month");
    expect(c).toEqual({
      window: "month",
      windowStart: null,
      generatedAt: null,
      totals: null,
      weekly: null,
      heroes: null,
      matchups: null,
      playersRanked: null,
    });
  });

  it("survives a non-object body", () => {
    expect(normalizeCommunity("nope").heroes).toBeNull();
    expect(normalizeCommunity(null).window).toBe("all");
  });

  it("keeps humanVsExpert null when only it is missing", () => {
    const c = normalizeCommunity({ totals: { games: 3, human: 1, hardExpert: 1, casual: 1 } });
    expect(c.totals).toEqual({ games: 3, human: 1, hardExpert: 1, casual: 1, humanVsExpert: null });
  });

  it("drops zero-game heroes, mirror matchups, and crowns with no username", () => {
    const c = normalizeCommunity({
      heroes: [
        { heroId: "thrall", games: 4, wins: 9, draws: 0, crown: { wins: 2, games: 3 } },
        { heroId: "appa", games: 0, wins: 0, draws: 0, crown: null },
        { games: 3 },
      ],
      matchups: [
        { heroId: "thrall", opponentHeroId: "thrall", games: 3, wins: 1, draws: 0 },
        { heroId: "thrall", opponentHeroId: "appa", games: 3, wins: 1, draws: 0 },
        { heroId: "thrall", opponentHeroId: null, games: 3, wins: 1, draws: 0 },
      ],
    });
    expect(c.heroes).toEqual([{ heroId: "thrall", heroName: null, games: 4, wins: 4, draws: 0, crown: null }]);
    expect(c.matchups).toEqual([{ heroId: "thrall", opponentHeroId: "appa", games: 3, wins: 1, draws: 0 }]);
  });
});

describe("normalizeHero", () => {
  it("stands in the asked hero id and nulls every absent section", () => {
    const h = normalizeHero({}, "the-narrator", "all");
    expect(h).toMatchObject({
      heroId: "the-narrator",
      games: 0,
      totalHumanSeatGames: null,
      pilotCount: null,
      pilots: null,
      crown: null,
      matchups: null,
      byOpponentKind: null,
    });
  });

  it("drops pilots without a username", () => {
    const h = normalizeHero(
      { pilots: [{ username: "mossback", games: 3, wins: 2, draws: 0 }, { games: 9, wins: 9 }] },
      "thrall",
    );
    expect(h.pilots).toEqual([{ username: "mossback", avatarUrl: null, games: 3, wins: 2, draws: 0 }]);
  });
});

describe("normalizeStatsLeaderboard", () => {
  const TODAY_ROW = { rank: 1, username: "TinCanTom", avatarUrl: null, level: 3, xp: 400, gamesPlayed: 10, wins: 6 };

  it("reads today's prod row and nulls the §2c fields", () => {
    const board = normalizeStatsLeaderboard({ players: [TODAY_ROW] });
    expect(board.total).toBeNull();
    expect(board.players[0]).toMatchObject({
      username: "TinCanTom",
      xp: 400,
      mainHeroId: null,
      mainHeroName: null,
      recentForm: null,
      currentStreak: null,
      monthGames: null,
      monthWins: null,
    });
  });

  it("joins the §2c fields back by username and caps form at 5", () => {
    const board = normalizeStatsLeaderboard(
      {
        total: 214,
        players: [
          { ...TODAY_ROW, mainHeroId: "thrall", recentForm: ["W", "L", "X", "D", "W", "W", "L"], currentStreak: 2, monthGames: 4, monthWins: 9 },
        ],
      },
      "month",
    );
    expect(board.total).toBe(214);
    expect(board.players[0]).toMatchObject({
      mainHeroId: "thrall",
      recentForm: ["W", "L", "D", "W", "W"],
      currentStreak: 2,
      monthGames: 4,
      monthWins: 4,
    });
  });
});

describe("normalizeStatsPlayer", () => {
  const TODAY = {
    user: { username: "mossback", avatarUrl: null },
    badges: [{ id: "regular", name: "Regular", blurb: "", unlocked: false, unlockedWhy: "" }],
    stats: { totalGames: 3, wins: 2, losses: 1, draws: 0, byHero: [] },
  };

  it("nulls every addition on today's payload", () => {
    const p = normalizeStatsPlayer(TODAY);
    expect(p).not.toBeNull();
    expect(p).toMatchObject({
      username: "mossback",
      calendar: null,
      byHeroOpponentHero: null,
      leaderboard: null,
      xpPerWin: null,
      badgeProgress: null,
    });
  });

  it("returns null when the body names nobody", () => {
    expect(normalizeStatsPlayer({ stats: {} })).toBeNull();
  });

  it("reads the additions, sorting and filtering them", () => {
    const p = normalizeStatsPlayer({
      ...TODAY,
      badges: [{ ...TODAY.badges[0], progress: { current: 40, target: 25 } }],
      stats: {
        ...TODAY.stats,
        calendar: [
          { date: "2026-09-02", games: 2 },
          { date: "2026-09-01", games: 1 },
          { date: "2026-09-03", games: 0 },
          { date: "bad", games: 4 },
        ],
        byHeroOpponentHero: [
          { heroId: "thrall", opponentHeroId: "appa", games: 1, wins: 1, draws: 0 },
          { heroId: "thrall", opponentHeroId: "batman", games: 5, wins: 2, draws: 0 },
        ],
      },
      leaderboard: { rank: 4, of: 214, next: { username: "quietharbor", rank: 3, xpGap: 640 } },
      xpPerWin: { human: 40, expert: 33, hard: 27 },
    });
    expect(p?.calendar).toEqual([
      { date: "2026-09-01", games: 1 },
      { date: "2026-09-02", games: 2 },
    ]);
    expect(p?.byHeroOpponentHero?.map((r) => r.opponentHeroId)).toEqual(["batman", "appa"]);
    expect(p?.leaderboard?.next?.xpGap).toBe(640);
    expect(p?.xpPerWin).toEqual({ human: 40, expert: 33, hard: 27 });
    expect(p?.badgeProgress).toEqual({ regular: { current: 25, target: 25 } });
  });

  it("keeps a #1 player's `next: null` and nulls an incomplete xpPerWin", () => {
    const p = normalizeStatsPlayer({ ...TODAY, leaderboard: { rank: 1, of: 9, next: null }, xpPerWin: { human: 40 } });
    expect(p?.leaderboard).toEqual({ rank: 1, of: 9, next: null });
    expect(p?.xpPerWin).toBeNull();
  });
});
