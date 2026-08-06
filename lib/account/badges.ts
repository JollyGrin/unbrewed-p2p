/**
 * The badge case (issue #577) — the fetch layer for `GET /me/badges` and
 * `PUT /me/badge` on the accounts API.
 *
 * Same contract as the rest of lib/account: never throws, never logs, every
 * failure becomes a typed reason, and a 503 — the normal answer of a build with
 * no telemetry link — reads as "nothing to show", not as an error.
 *
 * Two things about this endpoint pair are worth knowing before reading the code:
 *
 * 1. **The catalog is the server's, not ours.** Ids, names, blurbs and unlock
 *    hints all arrive evaluated; the predicates never leave the API. So this
 *    module models a badge as data, and an id it has never heard of is a
 *    perfectly ordinary badge — the client only needs its OWN opinion about an
 *    id when it goes looking for art (see components/Badges/BadgeGlyph).
 * 2. **A 503 still carries `selected`.** The player's pick is the API's own
 *    storage, not telemetry's, so it survives an upstream outage. We read it off
 *    the failure body too, which is what lets a wearer keep their badge on the
 *    HUD while the badge case itself has nothing to show.
 */
import { API_URL } from "./apiUrl";

/** One badge as the API evaluated it for this player. */
export interface Badge {
  id: string;
  name: string;
  blurb: string;
  unlocked: boolean;
  /** Requirement plus progress, e.g. `"Play 25 games (12/25)"`. Sent for unlocked badges too. */
  unlockedWhy: string;
}

export interface BadgeCase {
  badges: Badge[];
  /** The badge the player chose to wear, or null. */
  selected: string | null;
}

/** Why the case didn't arrive. `unavailable` is the catch-all → quiet state. */
export type BadgesFailure = "unauthorized" | "rate_limited" | "unavailable";

export type BadgesResult =
  | { ok: true; value: BadgeCase }
  | {
      ok: false;
      reason: BadgesFailure;
      /**
       * The selection the API reported anyway. Present on its 503s — the pick is
       * stored, not recomputed — and null whenever we couldn't reach it at all.
       */
      selected: string | null;
    };

/**
 * Why a write didn't take.
 * - `locked`      — 422: the server says this badge isn't unlocked (or isn't a
 *                   badge). Reachable honestly, from stats that moved under a
 *                   page left open, so it is a message and not a bug report.
 * - `unavailable` — 503/network. Setting a badge needs telemetry to check the
 *                   unlock, so it fails closed; CLEARING never does.
 */
export type SelectFailure =
  | "locked"
  | "unauthorized"
  | "rate_limited"
  | "unavailable";

export type SelectResult =
  | { ok: true; selected: string | null }
  | { ok: false; reason: SelectFailure };

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** `selected` off any body shape, including a failure body. */
const readSelected = (body: unknown): string | null =>
  asString(asRecord(body)?.selected);

/**
 * One catalog row. An entry without an id is dropped — everything else is keyed
 * off it — but a missing name/blurb/hint only costs that row its text, because
 * a badge the player can SEE and not read still beats a hole in the grid.
 */
const normalizeBadge = (raw: unknown): Badge | null => {
  const row = asRecord(raw);
  const id = row ? asString(row.id) : null;
  if (!row || !id) return null;
  return {
    id,
    name: asString(row.name) ?? id,
    blurb: asString(row.blurb) ?? "",
    unlocked: row.unlocked === true,
    unlockedWhy: asString(row.unlockedWhy) ?? "",
  };
};

/**
 * Body → badge case. Catalog order is the API's and is preserved: it runs from
 * the first badge a player earns to the last, which is the order the case wants
 * to be read in.
 */
export const normalizeBadgeCase = (body: unknown): BadgeCase => {
  const root = asRecord(body) ?? {};
  const raw = Array.isArray(root.badges) ? root.badges : [];
  const badges: Badge[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const badge = normalizeBadge(entry);
    // A duplicated id would render twice and select ambiguously; first wins.
    if (!badge || seen.has(badge.id)) continue;
    seen.add(badge.id);
    badges.push(badge);
  }
  const selected = readSelected(root);
  return {
    badges,
    // A selection naming a badge the catalog didn't send can't be rendered or
    // cleared coherently, so it reads as "wearing nothing" here. It is still
    // stored server-side; picking any badge overwrites it.
    selected: selected && seen.has(selected) ? selected : null,
  };
};

/**
 * The signed-in player's badge case.
 *
 * The player id is never sent: the API derives it from the session cookie.
 */
export const fetchBadgeCase = async (): Promise<BadgesResult> => {
  try {
    const res = await fetch(`${API_URL}/me/badges`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      const reason: BadgesFailure =
        res.status === 401
          ? "unauthorized"
          : res.status === 429
            ? "rate_limited"
            : "unavailable";
      // The 503 body carries the stored selection; anything else may not, and a
      // body we can't read is simply no selection.
      let selected: string | null = null;
      try {
        selected = readSelected(await res.json());
      } catch {
        /* no body, or not JSON — nothing more to learn */
      }
      return { ok: false, reason, selected };
    }
    return { ok: true, value: normalizeBadgeCase(await res.json()) };
  } catch {
    return { ok: false, reason: "unavailable", selected: null };
  }
};

/**
 * Wear a badge, or `null` to take one off.
 *
 * The server decides whether a badge is unlocked — the client's copy of the
 * catalog is a render hint, never the check — so a 422 here is the authority
 * disagreeing with a stale page, and the caller's job is to say so quietly.
 */
export const putSelectedBadge = async (
  id: string | null,
): Promise<SelectResult> => {
  try {
    const res = await fetch(`${API_URL}/me/badge`, {
      method: "PUT",
      credentials: "include",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      if (res.status === 422) return { ok: false, reason: "locked" };
      if (res.status === 401) return { ok: false, reason: "unauthorized" };
      if (res.status === 429) return { ok: false, reason: "rate_limited" };
      return { ok: false, reason: "unavailable" };
    }
    // Trust the server's echo over what we asked for; they only differ if
    // something changed under us, and its answer is the one that's stored.
    let selected: string | null = id;
    try {
      selected = readSelected(await res.json());
    } catch {
      /* a 200 with no readable body still means the write took */
    }
    return { ok: true, selected };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
};

/** The catalog row for an id, or undefined. */
export const badgeById = (badges: Badge[], id: string | null): Badge | undefined =>
  id ? badges.find((badge) => badge.id === id) : undefined;
