/**
 * Body → typed value for every stats-dashboard route. Same house rules as
 * lib/account: never throws, a malformed row is dropped rather than rendered as
 * a hole, and a section the api didn't send is `null` (hide it), never an empty
 * default that would read as "you have none of these".
 */
import { normalizeLeaderboard } from "@/lib/account/leaderboard";
import { normalizePublicProfile } from "@/lib/account/publicProfile";

import type {
  BadgeProgress,
  CalendarDay,
  Community,
  CommunityHero,
  CommunityTotals,
  CommunityWeek,
  Crown,
  FormResult,
  HeroMatchup,
  HeroOpponentHero,
  HeroPilot,
  HeroStats,
  KindCounts,
  LeaderboardPosition,
  Matchup,
  StatsLeaderboard,
  StatsLeaderboardRow,
  StatsPlayer,
  StatsWindow,
  XpPerWin,
} from "./types";

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

/** A non-negative integer, or null when absent/unusable. */
const asOptionalCount = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null;

/** A count, 0 when absent — for numbers INSIDE a row that already exists. */
const asCount = (value: unknown): number => asOptionalCount(value) ?? 0;

const asWindow = (value: unknown, fallback: StatsWindow): StatsWindow =>
  value === "all" || value === "month" ? value : fallback;

/** games/wins/draws with wins ≤ games and draws ≤ games − wins. */
const split = (row: Record<string, unknown>) => {
  const games = asCount(row.games);
  const wins = Math.min(asCount(row.wins), games);
  return { games, wins, draws: Math.min(asCount(row.draws), games - wins) };
};

/** Maps an array with `fn`, dropping nulls; `null` when it isn't an array. */
const rows = <T>(raw: unknown, fn: (row: Record<string, unknown>) => T | null): T[] | null => {
  if (!Array.isArray(raw)) return null;
  const out: T[] = [];
  for (const entry of raw) {
    const record = asRecord(entry);
    const value = record ? fn(record) : null;
    if (value !== null) out.push(value);
  }
  return out;
};

export const normalizeKindCounts = (raw: unknown): KindCounts | null => {
  const row = asRecord(raw);
  if (!row) return null;
  return {
    human: asCount(row.human),
    hardExpert: asCount(row.hardExpert),
    casual: asCount(row.casual),
  };
};

const normalizeCrown = (raw: unknown): Crown | null => {
  const row = asRecord(raw);
  const username = row ? asString(row.username) : null;
  if (!row || !username) return null;
  const games = asCount(row.games);
  return {
    username,
    avatarUrl: asString(row.avatarUrl),
    games,
    wins: Math.min(asCount(row.wins), games),
  };
};

const normalizeTotals = (raw: unknown): CommunityTotals | null => {
  const row = asRecord(raw);
  const kinds = normalizeKindCounts(row);
  if (!row || !kinds) return null;
  const hve = asRecord(row.humanVsExpert);
  const hveGames = hve ? asCount(hve.games) : 0;
  return {
    ...kinds,
    games: asCount(row.games),
    humanVsExpert: hve
      ? { games: hveGames, wins: Math.min(asCount(hve.wins), hveGames) }
      : null,
  };
};

const normalizeWeek = (row: Record<string, unknown>): CommunityWeek | null => {
  const weekStart = asString(row.weekStart);
  const kinds = normalizeKindCounts(row);
  return weekStart && kinds ? { weekStart, ...kinds } : null;
};

const normalizeCommunityHero = (row: Record<string, unknown>): CommunityHero | null => {
  const heroId = asString(row.heroId);
  if (!heroId) return null;
  return {
    heroId,
    heroName: asString(row.heroName),
    ...split(row),
    crown: normalizeCrown(row.crown),
  };
};

const normalizeMatchup = (row: Record<string, unknown>): Matchup | null => {
  const heroId = asString(row.heroId);
  const opponentHeroId = asString(row.opponentHeroId);
  // Mirror matches and null heroes are omitted by contract; drop any that leak.
  if (!heroId || !opponentHeroId || heroId === opponentHeroId) return null;
  const counts = split(row);
  return counts.games > 0 ? { heroId, opponentHeroId, ...counts } : null;
};

/** `GET /community` body. `window` falls back to the one we asked for. */
export const normalizeCommunity = (body: unknown, asked: StatsWindow = "all"): Community => {
  const root = asRecord(body) ?? {};
  return {
    window: asWindow(root.window, asked),
    windowStart: asString(root.windowStart),
    generatedAt: asString(root.generatedAt),
    totals: normalizeTotals(root.totals),
    weekly: rows(root.weekly, normalizeWeek),
    heroes: rows(root.heroes, (row) => {
      const hero = normalizeCommunityHero(row);
      return hero && hero.games > 0 ? hero : null;
    }),
    matchups: rows(root.matchups, normalizeMatchup),
    playersRanked: asOptionalCount(root.playersRanked),
  };
};

const normalizePilot = (raw: unknown): HeroPilot | null => {
  const row = asRecord(raw);
  const username = row ? asString(row.username) : null;
  if (!row || !username) return null;
  return { username, avatarUrl: asString(row.avatarUrl), ...split(row) };
};

const normalizeHeroMatchup = (row: Record<string, unknown>): HeroMatchup | null => {
  const opponentHeroId = asString(row.opponentHeroId);
  if (!opponentHeroId) return null;
  const counts = split(row);
  return counts.games > 0
    ? { opponentHeroId, opponentHeroName: asString(row.opponentHeroName), ...counts }
    : null;
};

/**
 * `GET /heroes?h=` body. An unknown or never-played hero is a 200 with zeros
 * (contract §1b), so the hero id we asked for stands in when the body omits it.
 */
export const normalizeHero = (
  body: unknown,
  heroId: string,
  asked: StatsWindow = "all",
): HeroStats => {
  const root = asRecord(body) ?? {};
  const pilots = rows(root.pilots, normalizePilot);
  return {
    heroId: asString(root.heroId) ?? heroId,
    heroName: asString(root.heroName),
    window: asWindow(root.window, asked),
    windowStart: asString(root.windowStart),
    generatedAt: asString(root.generatedAt),
    ...split(root),
    totalHumanSeatGames: asOptionalCount(root.totalHumanSeatGames),
    pilotCount: asOptionalCount(root.pilotCount),
    pilots,
    crown: normalizePilot(root.crown),
    matchups: rows(root.matchups, normalizeHeroMatchup),
    byOpponentKind: normalizeKindCounts(root.byOpponentKind),
  };
};

const FORM: ReadonlySet<string> = new Set(["W", "L", "D"]);

const normalizeForm = (raw: unknown, max: number): FormResult[] | null => {
  if (!Array.isArray(raw)) return null;
  return raw
    .filter((entry): entry is FormResult => typeof entry === "string" && FORM.has(entry))
    .slice(0, max);
};

/**
 * `GET /leaderboard` body: today's rows (parsed by lib/account's own
 * normaliser, so ranks/dedupe/clamps stay identical) plus §2c's fields, joined
 * back by username.
 */
export const normalizeStatsLeaderboard = (
  body: unknown,
  asked: StatsWindow = "all",
): StatsLeaderboard => {
  const root = asRecord(body) ?? {};
  const base = normalizeLeaderboard(body);
  const extras = new Map<string, Record<string, unknown>>();
  for (const entry of Array.isArray(root.players) ? root.players : []) {
    const row = asRecord(entry);
    const username = row ? asString(row.username) : null;
    if (row && username && !extras.has(username.toLowerCase())) {
      extras.set(username.toLowerCase(), row);
    }
  }
  const players: StatsLeaderboardRow[] = base.players.map((row) => {
    const raw = extras.get(row.username.toLowerCase()) ?? {};
    const monthGames = asOptionalCount(raw.monthGames);
    const monthWins = asOptionalCount(raw.monthWins);
    return {
      ...row,
      mainHeroId: asString(raw.mainHeroId),
      mainHeroName: asString(raw.mainHeroName),
      recentForm: normalizeForm(raw.recentForm, 5),
      currentStreak: asOptionalCount(raw.currentStreak),
      monthGames,
      monthWins:
        monthWins === null ? null : Math.min(monthWins, monthGames ?? monthWins),
    };
  });
  return {
    window: asked,
    generatedAt: base.generatedAt,
    total: asOptionalCount(root.total),
    players,
  };
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const normalizeCalendar = (raw: unknown): CalendarDay[] | null => {
  const days = rows(raw, (row) => {
    const date = asString(row.date);
    const games = asCount(row.games);
    return date && DATE.test(date) && games > 0 ? { date, games } : null;
  });
  return days ? [...days].sort((a, b) => a.date.localeCompare(b.date)) : null;
};

const normalizeHeroOpponentHero = (row: Record<string, unknown>): HeroOpponentHero | null => {
  const counts = split(row);
  if (counts.games <= 0) return null;
  return {
    heroId: asString(row.heroId),
    heroName: asString(row.heroName),
    opponentHeroId: asString(row.opponentHeroId),
    opponentHeroName: asString(row.opponentHeroName),
    ...counts,
  };
};

const normalizePosition = (raw: unknown): LeaderboardPosition | null => {
  const row = asRecord(raw);
  const rank = row ? asOptionalCount(row.rank) : null;
  if (!row || !rank) return null;
  const next = asRecord(row.next);
  const nextName = next ? asString(next.username) : null;
  return {
    rank,
    of: Math.max(rank, asCount(row.of)),
    next:
      next && nextName
        ? { username: nextName, rank: asCount(next.rank), xpGap: asCount(next.xpGap) }
        : null,
  };
};

const normalizeXpPerWin = (raw: unknown): XpPerWin | null => {
  const row = asRecord(raw);
  if (!row) return null;
  const human = asOptionalCount(row.human);
  const expert = asOptionalCount(row.expert);
  const hard = asOptionalCount(row.hard);
  return human !== null && expert !== null && hard !== null ? { human, expert, hard } : null;
};

/** `null` when no badge carries progress — an api from before §2e. */
const normalizeBadgeProgress = (raw: unknown): Record<string, BadgeProgress> | null => {
  if (!Array.isArray(raw)) return null;
  const out: Record<string, BadgeProgress> = {};
  let any = false;
  for (const entry of raw) {
    const row = asRecord(entry);
    const id = row ? asString(row.id) : null;
    const progress = row ? asRecord(row.progress) : null;
    const target = progress ? asOptionalCount(progress.target) : null;
    if (!id || !progress || !target || id in out) continue;
    out[id] = { current: Math.min(asCount(progress.current), target), target };
    any = true;
  }
  return any ? out : null;
};

/** `GET /players?u=` body → profile + additions, or null if it names nobody. */
export const normalizeStatsPlayer = (body: unknown): StatsPlayer | null => {
  const profile = normalizePublicProfile(body);
  if (!profile) return null;
  const root = asRecord(body) ?? {};
  const stats = asRecord(root.stats) ?? {};
  return {
    ...profile,
    calendar: normalizeCalendar(stats.calendar),
    byHeroOpponentHero: (() => {
      const list = rows(stats.byHeroOpponentHero, normalizeHeroOpponentHero);
      return list ? [...list].sort((a, b) => b.games - a.games) : null;
    })(),
    leaderboard: normalizePosition(root.leaderboard),
    xpPerWin: normalizeXpPerWin(root.xpPerWin),
    badgeProgress: normalizeBadgeProgress(root.badges),
  };
};
