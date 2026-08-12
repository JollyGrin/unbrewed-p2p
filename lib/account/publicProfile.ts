/**
 * Public player profiles (issue #590) — the fetch layer for `GET /players?u=`
 * and `GET /players/games?u=` on the accounts API (unbrewed-api ticket 22).
 *
 * These are the first account reads that are NOT self-scoped: no cookie, no
 * session, any visitor can ask about any username. Two consequences shape the
 * module:
 *
 * 1. **`credentials: "omit"`, deliberately.** The routes ignore a session and
 *    are IP rate-limited; sending the cookie anyway would only make a cacheable
 *    public GET look like a personalised one.
 * 2. **`not_found` is a first-class reason, not a failure.** A username nobody
 *    has ever signed in with is an ordinary outcome of a typed URL, and the
 *    page owes it a calm sentence — the same tone `/account` gives a guest —
 *    rather than the "something is down" state a 503 gets.
 *
 * Everything else follows the house rules of lib/account: never throws, never
 * logs, every failure becomes a typed reason.
 *
 * The payload is deliberately close to the self-scoped ones, so the normalizers
 * are the SAME functions `/me/stats` and `/me/badges` use — a public profile is
 * a subset of the account payload, never a parallel shape.
 */
import { API_URL } from "./apiUrl";
import { BadgeCase, normalizeBadgeCase } from "./badges";
import {
  AccountGamesPage,
  GAMES_PAGE_SIZE,
  HistoryResult,
  normalizeGamesPage,
} from "./gameHistory";
import { AccountStats, normalizeStats } from "./stats";

/**
 * Another player's profile as the API is willing to publish it.
 *
 * The progression fields live INSIDE `stats` rather than beside it, even though
 * the wire sends them at the top level as well: that is the shape
 * `levelProgress()` already reads, so the level bar works on this profile with
 * no second code path. The top-level copies win when both are present.
 */
export interface PublicProfile {
  username: string;
  avatarUrl: string | null;
  /** The evaluated catalog plus the badge being worn — read-only here. */
  badges: BadgeCase;
  stats: AccountStats;
}

/**
 * Why a profile didn't arrive.
 * - `not_found`    — 404: no account by that name (a calm empty state)
 * - `rate_limited` — 429 on the shared public bucket
 * - `unavailable`  — the catch-all: 503, CORS, DNS, garbled body
 */
export type PublicProfileFailure = "not_found" | "rate_limited" | "unavailable";

export type PublicProfileResult =
  | { ok: true; value: PublicProfile }
  | { ok: false; reason: PublicProfileFailure };

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
 * Body → profile, or null when the payload names nobody. A profile without a
 * username can't be titled or linked to, so it reads as a miss rather than as
 * an anonymous page.
 */
export const normalizePublicProfile = (body: unknown): PublicProfile | null => {
  const root = asRecord(body) ?? {};
  const user = asRecord(root.user) ?? {};
  const username = asString(user.username);
  if (!username) return null;

  const stats = normalizeStats(root.stats);
  return {
    username,
    avatarUrl: asString(user.avatarUrl),
    // The public payload spells the selection `selectedBadge`; the badge case
    // normalizer wants `selected`, so rename rather than fork the parser.
    badges: normalizeBadgeCase({
      badges: root.badges,
      selected: root.selectedBadge,
    }),
    stats: {
      ...stats,
      level: asCount(root.level) ?? stats.level,
      xp: asCount(root.xp) ?? stats.xp,
      xpForNext: asCount(root.xpForNext) ?? stats.xpForNext,
    },
  };
};

/** Any player's public profile. No session is sent, and none is required. */
export const fetchPublicProfile = async (
  username: string,
): Promise<PublicProfileResult> => {
  try {
    const res = await fetch(
      `${API_URL}/players?u=${encodeURIComponent(username)}`,
      { credentials: "omit", headers: { Accept: "application/json" } },
    );
    if (!res.ok) {
      if (res.status === 404) return { ok: false, reason: "not_found" };
      if (res.status === 429) return { ok: false, reason: "rate_limited" };
      return { ok: false, reason: "unavailable" };
    }
    const profile = normalizePublicProfile(await res.json());
    // A 200 that names nobody is as good as a 404 from here.
    return profile
      ? { ok: true, value: profile }
      : { ok: false, reason: "not_found" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
};

/**
 * One page of another player's finished games, newest first.
 *
 * Same cursor pagination as `GET /me/games` — the API ticket calls this route a
 * passthrough of the read that backs it, "same pagination shape so the client
 * component is reusable" — so the opaque `before` cursor and the `nextBefore`
 * in the answer mean exactly what they do there.
 */
export const fetchPublicGames = async (
  username: string,
  options: { limit?: number; before?: string | null } = {},
): Promise<HistoryResult<AccountGamesPage>> => {
  const params = new URLSearchParams();
  params.set("u", username);
  params.set("limit", String(options.limit ?? GAMES_PAGE_SIZE));
  if (options.before) params.set("before", options.before);

  try {
    const res = await fetch(`${API_URL}/players/games?${params.toString()}`, {
      credentials: "omit",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      if (res.status === 429) return { ok: false, reason: "rate_limited" };
      // A 404 here means the player vanished between the two calls; the profile
      // above already decides whether this page exists, so it is just "no
      // history" rather than a second not-found surface.
      return { ok: false, reason: "unavailable" };
    }
    return { ok: true, value: normalizeGamesPage(await res.json()) };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
};

/** The public profile URL for a username. Query param, not a route segment:
 *  the site is statically exported, so there is no dynamic route to serve. */
export const profileHref = (username: string): string =>
  `/stats?u=${encodeURIComponent(username)}`;
