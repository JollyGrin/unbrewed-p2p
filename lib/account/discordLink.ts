/**
 * Discord Linked Roles — the fetch layer for the perks card on /account
 * (issue #578; API side is unbrewed-api's `src/http/discordLink.ts`).
 *
 * This is a SECOND, entirely optional Discord consent on top of the sign-in
 * session: it lets the API push a couple of numbers (level, win counts) onto
 * the player's Discord profile so server admins can gate roles like @Veteran on
 * them. Nothing else on Unbrewed reads any of it.
 *
 * Same three house rules as the rest of lib/account:
 *
 * 1. **Never throws, never logs.** Every failure becomes a typed reason.
 * 2. **503 is normal.** A deploy with no Discord app configured answers 503 to
 *    all of these, and that has to read as "this feature isn't here" — the card
 *    then renders nothing at all — not as an error.
 * 3. **Guests cost nothing.** Nothing here is called until the account probe
 *    says "signed-in".
 */
import { API_URL } from "./apiUrl";

/** `GET /me/discord`, verbatim. */
export interface DiscordLinkStatus {
  linked: boolean;
  /**
   * The grant is on file but Discord rejected the stored refresh token — the
   * user revoked the app on their side. Only a fresh consent fixes it, so the
   * UI asks for one rather than offering a sync that cannot work.
   */
  stale: boolean;
  /** ISO timestamp of the last successful metadata push, or null. */
  lastPushAt: string | null;
}

/**
 * - `unauthorized` — the session went away underneath us (401)
 * - `rate_limited` — 429; refresh is one push a minute, per user
 * - `not_linked`   — 404 from refresh; the grant vanished between reads
 * - `unavailable`  — 503 (feature unconfigured), any other status, or no
 *                    answer at all. The card treats it as "don't render".
 */
export type DiscordLinkFailure =
  | "unauthorized"
  | "rate_limited"
  | "not_linked"
  | "unavailable";

export type DiscordLinkResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: DiscordLinkFailure };

const fail = (reason: DiscordLinkFailure): DiscordLinkResult<never> => ({
  ok: false,
  reason,
});

const failureFor = (status: number): DiscordLinkFailure => {
  if (status === 401) return "unauthorized";
  if (status === 429) return "rate_limited";
  if (status === 404) return "not_linked";
  return "unavailable";
};

/** A payload from an older/newer API still has to land on a usable shape. */
export const normalizeLinkStatus = (body: unknown): DiscordLinkStatus => {
  const raw = (body ?? {}) as Record<string, unknown>;
  return {
    linked: raw.linked === true,
    stale: raw.stale === true,
    lastPushAt: typeof raw.lastPushAt === "string" ? raw.lastPushAt : null,
  };
};

const statusRequest = async (
  path: string,
  init?: RequestInit,
): Promise<DiscordLinkResult<DiscordLinkStatus>> => {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      credentials: "include",
      headers: { Accept: "application/json" },
      ...init,
    });
    if (!res.ok) return fail(failureFor(res.status));
    return { ok: true, value: normalizeLinkStatus(await res.json()) };
  } catch {
    return fail("unavailable");
  }
};

/** One `GET /me/discord`. The card's whole existence hinges on this answer. */
export const fetchDiscordLink = (): Promise<
  DiscordLinkResult<DiscordLinkStatus>
> => statusRequest("/me/discord");

/**
 * "Sync now" — `POST /me/discord/refresh`, which answers with the fresh status
 * so the card can move its "last synced" line without a second read.
 */
export const refreshDiscordLink = (): Promise<
  DiscordLinkResult<DiscordLinkStatus>
> => statusRequest("/me/discord/refresh", { method: "POST" });

/**
 * `POST /me/discord/unlink` → 204. The API also best-effort clears the role
 * connection on Discord, so the roles drop without the user touching anything.
 */
export const unlinkDiscord = async (): Promise<DiscordLinkResult<null>> => {
  try {
    const res = await fetch(`${API_URL}/me/discord/unlink`, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return fail(failureFor(res.status));
    return { ok: true, value: null };
  } catch {
    return fail("unavailable");
  }
};

/**
 * Where the "Link Discord" button points. A real navigation, not a fetch: this
 * is an OAuth handoff that has to set a state cookie and bounce through
 * discord.com, and the API redirects back to `return_to` when it's done.
 *
 * The path guard mirrors `signInUrl`'s — the API rejects anything that isn't a
 * path, and `//evil.com` is a protocol-relative URL, not a path.
 */
export const discordLinkUrl = (returnTo?: string): string => {
  const path =
    returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")
      ? returnTo
      : "/";
  return `${API_URL}/auth/discord/link?return_to=${encodeURIComponent(path)}`;
};

// --- presentation helpers ----------------------------------------------------

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "just now" / "12 minutes ago" / "3 days ago" for the last successful push.
 *
 * Coarse on purpose: the sweep runs daily and the button is one-a-minute, so a
 * player never needs the second hand — and a rounded phrase stays honest when
 * the clocks disagree. A future timestamp (a skewed client) reads as "just
 * now" rather than as a negative age.
 */
export const syncedAgoLabel = (
  iso: string | null,
  now: number = Date.now(),
): string | null => {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;

  const age = now - at;
  if (age < MINUTE) return "just now";
  if (age < HOUR) {
    const minutes = Math.floor(age / MINUTE);
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  }
  if (age < DAY) {
    const hours = Math.floor(age / HOUR);
    return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  }
  const days = Math.floor(age / DAY);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
};
