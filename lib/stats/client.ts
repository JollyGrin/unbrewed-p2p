/**
 * The stats dashboard's fetch layer (issue #935): one function per public
 * route in contract §2, all in the lib/account house style — plain `fetch`,
 * `credentials: "omit"` (public, IP-limited, cacheable), never throws, never
 * logs, every failure a typed reason.
 *
 * **404 is quiet.** Today's prod api has no `/community` or `/heroes` route,
 * so a 404 there is "this deploy can't answer yet" → `unavailable`, never a
 * crash. Only `/players?u=` keeps 404 as `not_found`, because there it means
 * "nobody by that name" and the page owes that its own sentence.
 *
 * **Fixture switch.** `NEXT_PUBLIC_STATS_FIXTURES=1` answers EVERY call below
 * from `./fixtures` (typed against the wire contract, run through the same
 * normalisers), so all three pages render with no backend at all. The
 * fixtures are a dynamic import: a build without the flag never downloads them.
 */
import { API_URL } from "@/lib/account/apiUrl";
import {
  AccountGamesPage,
  GAMES_PAGE_SIZE,
  normalizeGamesPage,
} from "@/lib/account/gameHistory";
import { LEADERBOARD_LIMIT } from "@/lib/account/leaderboard";

import {
  normalizeCommunity,
  normalizeHero,
  normalizeStatsLeaderboard,
  normalizeStatsPlayer,
} from "./normalize";
import type {
  Community,
  HeroStats,
  StatsFailure,
  StatsLeaderboard,
  StatsPlayer,
  StatsResult,
  StatsWindow,
} from "./types";

/** True when the fixture switch is on. Read per call so tests can flip it. */
export const statsFixturesEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_STATS_FIXTURES === "1";

const loadFixtures = () => import("./fixtures");

/** `h` as the api validates it (contract §2b) — anything else is a miss. */
export const HERO_ID_PATTERN = /^[a-z0-9-]{1,64}$/;

const fail = (reason: StatsFailure): { ok: false; reason: StatsFailure } => ({
  ok: false,
  reason,
});

/**
 * GET a public route → parsed JSON, or a failure. `notFound` is what a 404
 * means on this route (see the header).
 */
const getJson = async (
  path: string,
  notFound: StatsFailure = "unavailable",
): Promise<{ ok: true; body: unknown } | { ok: false; reason: StatsFailure }> => {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      credentials: "omit",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      if (res.status === 404) return fail(notFound);
      if (res.status === 429) return fail("rate_limited");
      return fail("unavailable");
    }
    return { ok: true, body: await res.json() };
  } catch {
    return fail("unavailable");
  }
};

/** `GET /community?window=` (§2a). */
export const fetchCommunity = async (
  window: StatsWindow = "all",
): Promise<StatsResult<Community>> => {
  if (statsFixturesEnabled()) {
    const fx = await loadFixtures();
    return { ok: true, value: normalizeCommunity(fx.fixtureCommunity(window), window) };
  }
  const res = await getJson(`/community?window=${window}`);
  if (!res.ok) return res;
  return { ok: true, value: normalizeCommunity(res.body, window) };
};

/** `GET /heroes?h=&window=` (§2b). A malformed id never reaches the network. */
export const fetchHeroStats = async (
  heroId: string,
  window: StatsWindow = "all",
): Promise<StatsResult<HeroStats>> => {
  if (!HERO_ID_PATTERN.test(heroId)) return fail("not_found");
  if (statsFixturesEnabled()) {
    const fx = await loadFixtures();
    return { ok: true, value: normalizeHero(fx.fixtureHero(heroId, window), heroId, window) };
  }
  const params = new URLSearchParams({ h: heroId, window });
  const res = await getJson(`/heroes?${params.toString()}`);
  if (!res.ok) return res;
  return { ok: true, value: normalizeHero(res.body, heroId, window) };
};

/**
 * `GET /leaderboard?limit=&window=` (§2c).
 *
 * An api that predates §2c ignores `window` and answers with the all-time
 * board. Under `window=month` that would print all-time numbers under a
 * "this month" heading, so a month board whose rows carry no `monthGames` at
 * all is treated as `unavailable` rather than shown.
 */
export const fetchStatsLeaderboard = async (
  options: { limit?: number; window?: StatsWindow } = {},
): Promise<StatsResult<StatsLeaderboard>> => {
  const limit = options.limit ?? LEADERBOARD_LIMIT;
  const window = options.window ?? "all";
  let board: StatsLeaderboard;
  if (statsFixturesEnabled()) {
    const fx = await loadFixtures();
    board = normalizeStatsLeaderboard(fx.fixtureLeaderboard(limit, window), window);
  } else {
    const res = await getJson(`/leaderboard?limit=${limit}&window=${window}`);
    if (!res.ok) return res;
    board = normalizeStatsLeaderboard(res.body, window);
  }
  if (
    window === "month" &&
    board.players.length > 0 &&
    board.players.every((row) => row.monthGames === null)
  ) {
    return fail("unavailable");
  }
  return { ok: true, value: board };
};

/** `GET /players?u=` (§2d). 404 → `not_found`. */
export const fetchStatsPlayer = async (
  username: string,
): Promise<StatsResult<StatsPlayer>> => {
  let body: unknown;
  if (statsFixturesEnabled()) {
    const fx = await loadFixtures();
    body = fx.fixturePlayer(username);
    if (body === null) return fail("not_found");
  } else {
    const res = await getJson(`/players?u=${encodeURIComponent(username)}`, "not_found");
    if (!res.ok) return res;
    body = res.body;
  }
  const player = normalizeStatsPlayer(body);
  // A 200 that names nobody is as good as a 404 from here.
  return player ? { ok: true, value: player } : fail("not_found");
};

/**
 * `GET /players/games?u=` — same cursor pagination as `/me/games`. A 404 here
 * means the player vanished between the two calls; the profile already decides
 * whether the page exists, so it is just "no history".
 */
export const fetchStatsPlayerGames = async (
  username: string,
  options: { limit?: number; before?: string | null } = {},
): Promise<StatsResult<AccountGamesPage>> => {
  const limit = options.limit ?? GAMES_PAGE_SIZE;
  if (statsFixturesEnabled()) {
    const fx = await loadFixtures();
    return {
      ok: true,
      value: normalizeGamesPage(fx.fixturePlayerGames(username, limit, options.before ?? null)),
    };
  }
  const params = new URLSearchParams({ u: username, limit: String(limit) });
  if (options.before) params.set("before", options.before);
  const res = await getJson(`/players/games?${params.toString()}`);
  if (!res.ok) return res;
  return { ok: true, value: normalizeGamesPage(res.body) };
};
