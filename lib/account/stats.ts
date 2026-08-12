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
  /**
   * Draws in this slice. Additive (telemetry#58) and therefore OPTIONAL: an API
   * on the older aggregate sends the row without it, and the whole point of the
   * counted record is that it still computes then. Read it through
   * {@link splitDraws}, never `split.draws` directly, so "not sent" and "none"
   * land on the same 0 everywhere.
   */
  draws?: number;
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
  // --- progression (#577); null means "this deploy didn't send the block" ----
  /** Current level. 0 is a real level (under 100 lifetime XP), not "absent". */
  level: number | null;
  /** Lifetime XP. */
  xp: number | null;
  /** CUMULATIVE lifetime XP the next level needs — an absolute total, not a remainder. */
  xpForNext: number | null;
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

/**
 * A count that keeps the "absent" case: `null` when the field wasn't sent (or
 * came back unusable), which is what lets the level UI hide itself entirely on
 * an API deployed before the progression block existed.
 */
const asOptionalCount = (value: unknown): number | null => {
  const n = asNumber(value);
  return n !== null && n >= 0 ? Math.round(n) : null;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/**
 * games/wins/draws, with wins clamped into the games it was counted out of and
 * draws into whatever games are left after them — `losses = games − wins −
 * draws` is arithmetic the record leans on, so it must never go negative.
 */
const normalizeSplit = (raw: unknown): StatSplit | null => {
  const row = asRecord(raw);
  if (!row) return null;
  const games = asCount(row.games);
  const wins = Math.min(asCount(row.wins), games);
  return { games, wins, draws: Math.min(asCount(row.draws), games - wins) };
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
    level: asOptionalCount(root.level),
    xp: asOptionalCount(root.xp),
    xpForNext: asOptionalCount(root.xpForNext),
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
 * Measured over the COUNTED games (see {@link headlineRecord}), so the
 * percentage and the W–L–D beside it are always the same games — a shelf of
 * easy-bot wins moves neither.
 *
 * The guard is deliberately NOT applied to the table rows. There, the games
 * column sits right next to the percentage — the reader can see "2 games" and
 * discount it themselves — and dashing out most of a new player's heroes would
 * empty the very table they came to look at.
 */
export const headlineWinRate = (stats: AccountStats): string => {
  const record = headlineRecord(stats);
  return record.games < MIN_WIN_RATE_GAMES
    ? "—"
    : percentLabel({ games: record.games, wins: record.wins });
};

/** "12–3–1" — the record behind the percentage. */
export const recordLabel = (stats: AccountStats): string => {
  const record = headlineRecord(stats);
  return `${record.wins}–${record.losses}–${record.draws}`;
};

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

// --- opposition tiers (issue #592) -------------------------------------------

/** Draws in a split, treating a row from a pre-telemetry#58 API as having none. */
export const splitDraws = (split: StatSplit): number => split.draws ?? 0;

/** `games − wins − draws`, floored at 0 for a producer that doesn't add up. */
export const splitLosses = (split: StatSplit): number =>
  Math.max(0, split.games - split.wins - splitDraws(split));

/**
 * The tiers that earn nothing and prove nothing.
 *
 * Product rule (#592): an easy or medium bot game is practice. It gives no XP
 * and never touches your win/loss record — otherwise the shortest path to a
 * gaudy record is farming the bot that doesn't fight back. They stay VISIBLE on
 * the page, with the reason written next to them, because a player who won
 * fifty easy games and saw nothing move deserves an answer rather than a guess.
 */
export const CASUAL_TIERS: ReadonlySet<string> = new Set(["easy", "medium"]);

/** True for a bot row whose games are practice rather than record. */
export const isCasualBot = (bot: BotStat): boolean =>
  CASUAL_TIERS.has(bot.difficulty);

/**
 * Reading order for the opposition splits: humans first (handled by the
 * component), then the tiers that count, hardest first, then the casual pair
 * last — the demoted rows belong at the end of the line, not in the middle of
 * the record.
 *
 * `unknown` sits with the counted tiers deliberately. It is a tier telemetry
 * could not name, not a tier that doesn't count; after telemetry#58 it should
 * be all but empty, and until then dropping those games out of the record would
 * silently erase most of a player's bot history.
 */
const TIER_ORDER: Record<string, number> = {
  expert: 0,
  hard: 1,
  unknown: 2,
  medium: 3,
  easy: 4,
};

/** An unrecognised difficulty sorts with `unknown`: counted, in the middle. */
const tierRank = (bot: BotStat): number => TIER_ORDER[bot.difficulty] ?? 2;

/** Bot splits in reading order; ties (or a novel tier) fall back to games-desc. */
export const orderedBotSplits = (bots: BotStat[]): BotStat[] =>
  [...bots].sort((a, b) => tierRank(a) - tierRank(b) || b.games - a.games);

export interface CountedRecord {
  games: number;
  wins: number;
  losses: number;
  draws: number;
  /** Easy/medium games left OUT of the numbers above. Always > 0 here. */
  casualGames: number;
}

/**
 * The record with the casual tiers taken out — or `null` when there is nothing
 * to take out, which is the ordinary case and the whole degradation story.
 *
 * `null` covers three of them: an API that never sent `byOpponentKind` (older
 * deploy — the page must render exactly what it rendered before), a player with
 * no easy/medium games at all, and a payload whose casual rows are empty. In
 * every one of those the top-level `wins/losses/draws` telemetry already
 * computed is both authoritative and correct, and re-deriving it from splits
 * that need not sum to the whole would only invent a discrepancy.
 *
 * When casual games DO exist the record is summed from the counted rows
 * instead: human + expert + hard + unknown, with `losses = games − wins −
 * draws` per row so a missing `draws` (pre-telemetry#58) merely lands those
 * games in the loss column rather than breaking the arithmetic.
 */
export const countedRecord = (stats: AccountStats): CountedRecord | null => {
  const kind = stats.byOpponentKind;
  if (!kind) return null;
  const casualGames = kind.bots
    .filter(isCasualBot)
    .reduce((total, bot) => total + bot.games, 0);
  if (casualGames <= 0) return null;

  const counted: StatSplit[] = [
    ...(kind.human ? [kind.human] : []),
    ...kind.bots.filter((bot) => !isCasualBot(bot)),
  ];
  return counted.reduce<CountedRecord>(
    (record, split) => ({
      games: record.games + split.games,
      wins: record.wins + split.wins,
      losses: record.losses + splitLosses(split),
      draws: record.draws + splitDraws(split),
      casualGames,
    }),
    { games: 0, wins: 0, losses: 0, draws: 0, casualGames },
  );
};

/** The counted record when one applies, else telemetry's own totals. */
export const headlineRecord = (
  stats: AccountStats,
): { games: number; wins: number; losses: number; draws: number } =>
  countedRecord(stats) ?? {
    games: stats.totalGames,
    wins: stats.wins,
    losses: stats.losses,
    draws: stats.draws,
  };

/**
 * "3 casual bot games (easy/medium) not counted" — the one line that explains a
 * headline record smaller than the games tile above it. `null` when the two
 * agree and there is nothing to explain.
 */
export const casualGamesNote = (stats: AccountStats): string | null => {
  const record = countedRecord(stats);
  if (!record) return null;
  const games = record.casualGames;
  const plural = games === 1 ? "game" : "games";
  return `${games} casual bot ${plural} (easy/medium) not counted`;
};

/**
 * True when the player has an aggregate worth rendering at all. A zero-game
 * account and an account whose API forgot to count both land on the same
 * friendly "go play a game" state rather than on a wall of zeroes.
 */
export const hasPlayed = (stats: AccountStats): boolean => stats.totalGames > 0;

// --- levels (issue #577) -----------------------------------------------------

/**
 * Cumulative lifetime XP a level starts at: `50·N·(N+1)` (level 1 = 100,
 * level 10 = 5500). The API computes this too and publishes the formula in its
 * README precisely so a client can draw a WITHIN-level bar; `xpForNext` alone
 * only supports a lifetime bar, which reads as "nearly full" forever.
 *
 * That makes the curve the one number duplicated across the two services. It is
 * a deliberate, bounded duplication: if the API ever retunes it, the bar is
 * drawn against a stale floor — clamped to 0–100% by {@link levelProgress}, so
 * the failure mode is a bar in the wrong place, never a broken or absurd one.
 */
export const xpForLevel = (level: number): number =>
  level <= 0 ? 0 : 50 * level * (level + 1);

export interface LevelProgress {
  level: number;
  /** Lifetime XP. */
  xp: number;
  /** Cumulative XP this level started at. */
  floor: number;
  /** Cumulative XP the next level needs. */
  next: number;
  /** Whole percent through the current level, clamped to 0–100. */
  percent: number;
  /** Lifetime XP still to go before the next level, never negative. */
  toGo: number;
}

/**
 * The header's level bar, or `null` when there is no level to draw.
 *
 * `null` covers exactly one case that matters: an API deployed before the
 * progression block, which simply doesn't send the fields. The whole level UI
 * hides rather than rendering a zeroed bar — same degradation contract the
 * enriched stats sections already keep. Level 0 is NOT that case: it is a real
 * level for a player under 100 XP, and it draws a real (nearly empty) bar.
 *
 * Everything else here is defence against a producer bug rather than a case we
 * expect: an `xpForNext` at or below the level's floor would divide by zero or
 * flip the bar, so the span is floored at 1 and the percentage clamped.
 */
export const levelProgress = (stats: AccountStats): LevelProgress | null => {
  const { level, xp, xpForNext } = stats;
  if (level === null || xp === null || xpForNext === null) return null;
  const floor = xpForLevel(level);
  const span = Math.max(1, xpForNext - floor);
  const percent = Math.max(0, Math.min(100, Math.round(((xp - floor) / span) * 100)));
  return {
    level,
    xp,
    floor,
    next: xpForNext,
    percent,
    toGo: Math.max(0, xpForNext - xp),
  };
};
