/**
 * Player stats for the account page (issue #574) — the fetch layer for
 * `GET /me/stats` on the accounts API.
 *
 * The API caches telemetry's aggregate for 60s and merges the account's own
 * `username`/`avatarUrl` on top; the numbers themselves are telemetry's verbatim
 * (unbrewed-telemetry src/db/accounts.ts, `PlayerStats`). Same contract as the
 * rest of lib/account: never throws, never logs, every failure becomes a typed
 * reason, and a 503 — the normal state of a build with no telemetry link — has
 * to read as "nothing to show yet", not as an error.
 *
 * **Everything past the base totals is optional.** The enriched fields (streaks,
 * form, matchups, maps, splits) landed after the first stats deploy, so a client
 * newer than its API will simply not see them. They are modelled as `null` — not
 * as an empty default — precisely so the UI can tell "the server didn't send
 * this section" (hide it) apart from "you have none of these yet" (a zero row).
 */
import { API_URL } from "./apiUrl";

/** Games below which a win rate is noise rather than a statistic. */
export const MIN_WIN_RATE_GAMES = 5;

/** A win/loss/draw from the player's point of view. */
export type FormResult = "W" | "L" | "D";

/** games/wins for one slice of a player's history. */
export interface StatSplit {
  games: number;
  wins: number;
}

export interface HeroStat extends StatSplit {
  heroId: string | null;
  heroName: string | null;
}

export interface MapStat extends StatSplit {
  /** Map *id*, not a title — resolve with `mapLabel` from gameHistory. */
  map: string;
}

export interface BotStat extends StatSplit {
  difficulty: string;
}

export interface StreakStats {
  /** Consecutive wins counting back from the newest game; a draw breaks it. */
  current: number;
  /** Longest consecutive-win run anywhere in the player's history. */
  best: number;
}

export interface OpponentKindStats {
  human: StatSplit | null;
  bots: BotStat[];
}

export interface FirstPlayerStats {
  first: StatSplit;
  second: StatSplit;
}

export interface AccountStats {
  totalGames: number;
  wins: number;
  losses: number;
  draws: number;
  firstGameAt: string | null;
  lastGameAt: string | null;
  byHero: HeroStat[];
  // --- enriched; null means "this deploy didn't send the section" ------------
  avgDurationSeconds: number | null;
  avgTurns: number | null;
  streaks: StreakStats | null;
  /** Last 10 results, newest first. */
  recentForm: FormResult[] | null;
  byOpponentHero: HeroStat[] | null;
  byMap: MapStat[] | null;
  byOpponentKind: OpponentKindStats | null;
  firstPlayer: FirstPlayerStats | null;
}

/** Why stats didn't arrive. `unavailable` is the catch-all → quiet state. */
export type StatsFailure = "unauthorized" | "rate_limited" | "unavailable";

export type StatsResult =
  | { ok: true; value: AccountStats }
  | { ok: false; reason: StatsFailure };

const fail = (reason: StatsFailure): StatsResult => ({ ok: false, reason });

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** A count: a non-negative integer, or 0 for anything else. */
const asCount = (value: unknown): number => {
  const n = asNumber(value);
  return n !== null && n >= 0 ? Math.round(n) : 0;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** games/wins, with wins clamped into the games it was counted out of. */
const normalizeSplit = (raw: unknown): StatSplit | null => {
  const row = asRecord(raw);
  if (!row) return null;
  const games = asCount(row.games);
  return { games, wins: Math.min(asCount(row.wins), games) };
};

const byGamesDesc = <T extends StatSplit>(rows: T[]): T[] =>
  [...rows].sort((a, b) => b.games - a.games);

/**
 * Rows are sorted games-desc here rather than trusted from the wire: telemetry
 * already orders them, but the tables promise that order and re-sorting is free.
 */
const normalizeRows = <T extends StatSplit>(
  raw: unknown,
  extra: (row: Record<string, unknown>) => Omit<T, "games" | "wins">,
): T[] | null => {
  if (!Array.isArray(raw)) return null;
  const rows: T[] = [];
  for (const entry of raw) {
    const row = asRecord(entry);
    const split = normalizeSplit(row);
    // A row nobody played is a producer artefact, not a statistic.
    if (!row || !split || split.games <= 0) continue;
    rows.push({ ...extra(row), ...split } as T);
  }
  return byGamesDesc(rows);
};

const FORM: ReadonlySet<string> = new Set(["W", "L", "D"]);

const normalizeForm = (raw: unknown): FormResult[] | null => {
  if (!Array.isArray(raw)) return null;
  return raw.filter((entry): entry is FormResult =>
    typeof entry === "string" ? FORM.has(entry) : false,
  );
};

const normalizeStreaks = (raw: unknown): StreakStats | null => {
  const row = asRecord(raw);
  if (!row) return null;
  const best = asCount(row.best);
  // `current` is a run inside history, so it can never exceed the best run.
  return { current: Math.min(asCount(row.current), best), best };
};

const normalizeOpponentKind = (raw: unknown): OpponentKindStats | null => {
  const row = asRecord(raw);
  if (!row) return null;
  const bots = (normalizeRows<BotStat>(row.bots, (bot) => ({
    difficulty: asString(bot.difficulty) ?? "unknown",
  })) ?? []) as BotStat[];
  const human = normalizeSplit(row.human);
  // Neither side present is an empty envelope, not a section.
  if (!human && bots.length === 0) return null;
  return { human, bots };
};

const normalizeFirstPlayer = (raw: unknown): FirstPlayerStats | null => {
  const row = asRecord(raw);
  if (!row) return null;
  const first = normalizeSplit(row.first);
  const second = normalizeSplit(row.second);
  if (!first || !second) return null;
  return { first, second };
};

/** Body → stats. Anything unrecognisable degrades to a zero-game player. */
export const normalizeStats = (body: unknown): AccountStats => {
  const root = asRecord(body) ?? {};
  return {
    totalGames: asCount(root.totalGames),
    wins: asCount(root.wins),
    losses: asCount(root.losses),
    draws: asCount(root.draws),
    firstGameAt: asString(root.firstGameAt),
    lastGameAt: asString(root.lastGameAt),
    byHero:
      normalizeRows<HeroStat>(root.byHero, (row) => ({
        heroId: asString(row.heroId),
        heroName: asString(row.heroName),
      })) ?? [],
    avgDurationSeconds: asNumber(root.avgDurationSeconds),
    avgTurns: asNumber(root.avgTurns),
    streaks: normalizeStreaks(root.streaks),
    recentForm: normalizeForm(root.recentForm),
    byOpponentHero: normalizeRows<HeroStat>(root.byOpponentHero, (row) => ({
      heroId: asString(row.heroId),
      heroName: asString(row.heroName),
    })),
    byMap: normalizeRows<MapStat>(root.byMap, (row) => ({
      map: asString(row.map) ?? "unknown",
    })),
    byOpponentKind: normalizeOpponentKind(root.byOpponentKind),
    firstPlayer: normalizeFirstPlayer(root.firstPlayer),
  };
};

/**
 * The signed-in player's aggregate record.
 *
 * The player id is never sent: the API derives it from the session cookie.
 */
export const fetchAccountStats = async (): Promise<StatsResult> => {
  try {
    const res = await fetch(`${API_URL}/me/stats`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      if (res.status === 401) return fail("unauthorized");
      if (res.status === 429) return fail("rate_limited");
      // 503 (telemetry not configured / upstream down) and everything else we
      // don't model land on the same quiet state.
      return fail("unavailable");
    }
    return { ok: true, value: normalizeStats(await res.json()) };
  } catch {
    return fail("unavailable");
  }
};

// --- presentation helpers ----------------------------------------------------
// Pure, so every number on the page is testable without a DOM.

/**
 * Win rate as a whole percent, or null when there is nothing to divide by.
 * Draws sit in the denominator: "win rate" is wins out of games played, and a
 * draw is a game you did not win.
 */
export const winPercent = (split: StatSplit): number | null =>
  split.games > 0 ? Math.round((split.wins / split.games) * 100) : null;

/** "62%", or an em dash when the sample can't support one. */
export const percentLabel = (split: StatSplit): string => {
  const percent = winPercent(split);
  return percent === null ? "—" : `${percent}%`;
};

/**
 * The headline win rate, with the small-sample guard: under
 * `MIN_WIN_RATE_GAMES` games a percentage is theatre (one game = "100%"), so
 * the tile shows an em dash and the W–L–D tile carries the real information.
 *
 * The guard is deliberately NOT applied to the table rows. There, the games
 * column sits right next to the percentage — the reader can see "2 games" and
 * discount it themselves — and dashing out most of a new player's heroes would
 * empty the very table they came to look at.
 */
export const headlineWinRate = (stats: AccountStats): string =>
  stats.totalGames < MIN_WIN_RATE_GAMES
    ? "—"
    : percentLabel({ games: stats.totalGames, wins: stats.wins });

/** "12–3–1" — the record behind the percentage. */
export const recordLabel = (stats: AccountStats): string =>
  `${stats.wins}–${stats.losses}–${stats.draws}`;

/** "12:13" / "1:04:22" — clock form, asked for by the ticket. */
export const formatClock = (seconds: number | null): string | null => {
  if (seconds === null || seconds < 0) return null;
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = String(total % 60).padStart(2, "0");
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${secs}`;
  return `${minutes}:${secs}`;
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * "Aug 2026" — how long this player has been around, to the month.
 *
 * Read in UTC, like the rest of the account surfaces: the month a player
 * started is not worth a timezone, and a fixed reading keeps it stable.
 */
export const monthLabel = (iso: string | null): string | null => {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  const date = new Date(at);
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
};

/** Hero display name for a stat row, falling back to the id. */
export const statHeroLabel = (row: HeroStat): string =>
  row.heroName ?? row.heroId ?? "Unknown hero";

const capitalize = (word: string): string =>
  `${word.charAt(0).toUpperCase()}${word.slice(1)}`;

/** "Hard bots" — the lobby's tier wording, pluralised for a split label. */
export const botTierLabel = (bot: BotStat): string =>
  bot.difficulty === "unknown"
    ? "Bots"
    : `${capitalize(bot.difficulty)} bots`;

/**
 * True when the player has an aggregate worth rendering at all. A zero-game
 * account and an account whose API forgot to count both land on the same
 * friendly "go play a game" state rather than on a wall of zeroes.
 */
export const hasPlayed = (stats: AccountStats): boolean => stats.totalGames > 0;
