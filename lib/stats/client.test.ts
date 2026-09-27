/**
 * The stats client (#935): quiet failures against today's prod (404 on the new
 * routes), `not_found` only for `/players`, and the fixture switch answering
 * every call with no network at all.
 */
import {
  fetchCommunity,
  fetchHeroStats,
  fetchStatsLeaderboard,
  fetchStatsPlayer,
  fetchStatsPlayerGames,
} from "./client";
import { fixtureCommunity, fixtureHero, fixtureLeaderboard, fixturePlayer, fixturePlayerGames, FIXTURE_USERNAMES } from "./fixtures";
import { HIDDEN_HERO_NAMES, isRosterHero } from "./roster";

const respond = (status: number, body: unknown = {}) =>
  jest.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body });

const ORIGINAL_ENV = process.env.NEXT_PUBLIC_STATS_FIXTURES;

afterEach(() => {
  process.env.NEXT_PUBLIC_STATS_FIXTURES = ORIGINAL_ENV;
  jest.restoreAllMocks();
});

describe("against the network", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_STATS_FIXTURES;
  });

  it("maps a 404 on the new routes to unavailable", async () => {
    global.fetch = respond(404);
    expect(await fetchCommunity("month")).toEqual({ ok: false, reason: "unavailable" });
    expect(await fetchHeroStats("thrall")).toEqual({ ok: false, reason: "unavailable" });
    expect(await fetchStatsPlayerGames("mossback")).toEqual({ ok: false, reason: "unavailable" });
  });

  it("keeps a /players 404 as not_found and a 429 as rate_limited", async () => {
    global.fetch = respond(404);
    expect(await fetchStatsPlayer("nobody")).toEqual({ ok: false, reason: "not_found" });
    global.fetch = respond(429);
    expect(await fetchStatsPlayer("nobody")).toEqual({ ok: false, reason: "rate_limited" });
  });

  it("never throws on a network error", async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await fetchCommunity()).toEqual({ ok: false, reason: "unavailable" });
  });

  it("asks public routes without credentials and with the window", async () => {
    const fetchMock = respond(200, {});
    global.fetch = fetchMock;
    await fetchHeroStats("the-mandalorian", "month");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/heroes\?h=the-mandalorian&window=month$/);
    expect(init).toMatchObject({ credentials: "omit" });
  });

  it("rejects a malformed hero id without a request", async () => {
    const fetchMock = respond(200, {});
    global.fetch = fetchMock;
    expect(await fetchHeroStats("Not A Hero!")).toEqual({ ok: false, reason: "not_found" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats a month board from an api without §2c as unavailable", async () => {
    global.fetch = respond(200, { players: [{ rank: 1, username: "TinCanTom", xp: 10, gamesPlayed: 2, wins: 1 }] });
    expect(await fetchStatsLeaderboard({ window: "month" })).toEqual({ ok: false, reason: "unavailable" });
    expect((await fetchStatsLeaderboard({ window: "all" })).ok).toBe(true);
  });
});

describe("fixture switch", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_STATS_FIXTURES = "1";
    global.fetch = jest.fn().mockRejectedValue(new Error("network must not be touched"));
  });

  it("answers every call from fixtures", async () => {
    const community = await fetchCommunity("month");
    const hero = await fetchHeroStats("the-mandalorian", "month");
    const board = await fetchStatsLeaderboard({ limit: 5, window: "month" });
    const player = await fetchStatsPlayer("lanternjaw");
    const games = await fetchStatsPlayerGames("lanternjaw", { limit: 4 });
    for (const result of [community, hero, board, player, games]) expect(result.ok).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();

    if (!community.ok || !board.ok || !player.ok || !games.ok || !hero.ok) throw new Error("unreachable");
    expect(community.value.weekly).toHaveLength(12);
    expect(community.value.playersRanked).toBe(214);
    expect(hero.value.crown?.username).toBe("TinCanTom");
    expect(board.value.players).toHaveLength(5);
    expect(board.value.players.every((row) => row.monthGames !== null)).toBe(true);
    expect(player.value.stats.byHero[0].heroId).toBe("specter-knight");
    expect(player.value.badgeProgress).not.toBeNull();
    expect(games.value.games).toHaveLength(4);
    expect(games.value.nextBefore).toBe("4");
  });

  it("covers the edge cases the pages need", async () => {
    expect(await fetchStatsPlayer("nobody-by-that-name")).toEqual({ ok: false, reason: "not_found" });

    const narrator = await fetchHeroStats("the-narrator");
    expect(narrator).toMatchObject({ ok: true, value: { games: 0, pilots: [], crown: null } });

    const leon = await fetchHeroStats("leon-s-kennedy");
    expect(leon.ok && leon.value.crown).toBeNull();

    const rookie = await fetchStatsPlayer("newleaf");
    expect(rookie.ok && rookie.value.stats.totalGames).toBe(1);

    const clue = await fetchStatsPlayer("cluefinder");
    expect(clue.ok && clue.value.stats.byHero[0].heroId).toBe("nancy-drew");
  });
});

describe("fixtures", () => {
  const known = (id: string | null) => !id || isRosterHero(id) || id in HIDDEN_HERO_NAMES;

  it("use only real hero ids", () => {
    const ids: (string | null)[] = [];
    for (const window of ["all", "month"] as const) {
      const c = fixtureCommunity(window);
      c.heroes.forEach((h) => ids.push(h.heroId));
      c.matchups.forEach((m) => ids.push(m.heroId, m.opponentHeroId));
      fixtureHero("the-mandalorian", window).matchups.forEach((m) => ids.push(m.opponentHeroId));
      fixtureLeaderboard(50, window).players.forEach((p) => ids.push(p.mainHeroId));
    }
    for (const name of FIXTURE_USERNAMES) {
      const p = fixturePlayer(name);
      p?.stats.byHero.forEach((h) => ids.push(h.heroId));
      p?.stats.byHeroOpponentHero.forEach((r) => ids.push(r.heroId, r.opponentHeroId));
      fixturePlayerGames(name, 60, null).games.forEach((g) => {
        const game = g as { you: { heroId: string }; opponents: { heroId: string }[] };
        ids.push(game.you.heroId, ...game.opponents.map((o) => o.heroId));
      });
    }
    expect(ids.filter((id) => !known(id))).toEqual([]);
  });

  it("keep both matchup orientations consistent", () => {
    const { matchups } = fixtureCommunity("all");
    const byKey = new Map(matchups.map((m) => [`${m.heroId}|${m.opponentHeroId}`, m]));
    for (const m of matchups) {
      const back = byKey.get(`${m.opponentHeroId}|${m.heroId}`);
      expect(back?.games).toBe(m.games);
      expect((back?.wins ?? 0) + m.wins + m.draws).toBe(m.games);
    }
    expect(byKey.has("kenshiro|baba-yaga")).toBe(false);
  });

  it("leave one roster hero never played", () => {
    const played = new Set(fixtureCommunity("all").heroes.map((h) => h.heroId));
    expect(played.has("the-narrator")).toBe(false);
  });
});
