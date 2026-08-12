/**
 * The public leaderboard (issue #590) — the fetch layer for `GET /leaderboard`
 * on the accounts API (unbrewed-api ticket 22).
 *
 * Public, unauthenticated and cached server-side for ~5 minutes, so the client
 * asks once per page load and never retries: a board that didn't arrive is a
 * quiet sentence, exactly like the rest of lib/account.
 *
 * The API does the ranking (XP desc, wins then username as tie-breaks) and
 * sends `rank` per row. We keep its order verbatim — re-sorting here could only
 * disagree with the number printed beside each player.
 */
import { API_URL } from "./apiUrl";

/** One row of the board, already ranked by the API. */
export interface LeaderboardRow {
  rank: number;
  username: string;
  avatarUrl: string | null;
  level: number | null;
  xp: number;
  /** The badge this player is wearing, or null. */
  selectedBadge: string | null;
  gamesPlayed: number;
  wins: number;
}

export interface Leaderboard {
  /** When the API computed the board. Null when it didn't say. */
  generatedAt: string | null;
  players: LeaderboardRow[];
}

/** Why the board didn't arrive. `unavailable` is the catch-all → quiet state. */
export type LeaderboardFailure = "rate_limited" | "unavailable";

export type LeaderboardResult =
  | { ok: true; value: Leaderboard }
  | { ok: false; reason: LeaderboardFailure };

/** Rows we ask for. The API defaults to 50 and caps at 200. */
export const LEADERBOARD_LIMIT = 50;

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asCount = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null;

/**
 * One row, or null if it names nobody — the username is both the label and the
 * link target, so a row without one is a hole rather than a player.
 *
 * `rank` falls back to the row's position: the board is sent in rank order, so
 * position is the honest answer when the field is missing, and a blank rank
 * column would be the only visible symptom of a producer bug.
 */
const normalizeRow = (raw: unknown, index: number): LeaderboardRow | null => {
  const row = asRecord(raw);
  const username = row ? asString(row.username) : null;
  if (!row || !username) return null;
  const gamesPlayed = asCount(row.gamesPlayed) ?? 0;
  return {
    rank: asCount(row.rank) ?? index + 1,
    username,
    avatarUrl: asString(row.avatarUrl),
    // Level 0 is real (a player under 100 XP); null means "not sent", which
    // hides the column's value for that row rather than claiming a zero.
    level: asCount(row.level),
    xp: asCount(row.xp) ?? 0,
    selectedBadge: asString(row.selectedBadge),
    gamesPlayed,
    // A row can't have won more than it played; clamp rather than print it.
    wins: Math.min(asCount(row.wins) ?? 0, gamesPlayed),
  };
};

/** Body → board. Anything that isn't a `players` array is an empty board. */
export const normalizeLeaderboard = (body: unknown): Leaderboard => {
  const root = asRecord(body) ?? {};
  const raw = Array.isArray(root.players) ? root.players : [];
  const players: LeaderboardRow[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of raw.entries()) {
    const row = normalizeRow(entry, index);
    // A username rendered twice would link to one profile from two ranks.
    if (!row || seen.has(row.username.toLowerCase())) continue;
    seen.add(row.username.toLowerCase());
    players.push(row);
  }
  return { generatedAt: asString(root.generatedAt), players };
};

export const fetchLeaderboard = async (
  limit: number = LEADERBOARD_LIMIT,
): Promise<LeaderboardResult> => {
  try {
    const res = await fetch(`${API_URL}/leaderboard?limit=${limit}`, {
      credentials: "omit",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      if (res.status === 429) return { ok: false, reason: "rate_limited" };
      return { ok: false, reason: "unavailable" };
    }
    return { ok: true, value: normalizeLeaderboard(await res.json()) };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
};
