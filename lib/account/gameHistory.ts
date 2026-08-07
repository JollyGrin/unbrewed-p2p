/**
 * Game-history transport for the account page (issue #573) — the fetch layer
 * for `GET /me/games` on the accounts API (unbrewed-api ticket 14).
 *
 * The API is a thin passthrough of unbrewed-telemetry's accounts read API, so
 * the shape below is telemetry's verbatim (`docs`: unbrewed-telemetry
 * src/db/accounts.ts). Everything is nullable there because a producer may omit
 * it, and nothing here throws on a surprise: an unparseable page is treated as
 * "no history", exactly like a dead API.
 *
 * Same contract as the rest of lib/account: never throws, never logs, and turns
 * every failure — 401, 429, 503 `telemetry_not_configured`, CORS, DNS — into a
 * typed `reason`. `/me/games` answers 503 whenever telemetry is unconfigured or
 * unreachable, which is the NORMAL state of a self-hosted build, so that path
 * has to read as an empty shelf rather than an error.
 */
import { API_URL } from "./apiUrl";
import { catalogEntry } from "@/lib/pro/mapCatalog";

/** Page size we ask for. The API caps at 50 and defaults to 20 itself. */
export const GAMES_PAGE_SIZE = 20;

/** The player's own seat in one of their games. */
export interface AccountGameSeat {
  heroId: string | null;
  heroName: string | null;
  won: boolean;
  finalHealth: number | null;
}

/**
 * Every other seat in the game. `pilot` is telemetry's seat label — `"human"`,
 * `"bot"`, or `"llm:<model>"` — and `botDifficulty` is set only for bot seats.
 */
export interface AccountGameOpponent {
  heroId: string | null;
  heroName: string | null;
  pilot: string;
  botDifficulty: string | null;
}

export interface AccountGame {
  /** Telemetry's game id (`live-<room>-<createdAt>-<hash>` for live rooms). */
  id: string;
  endedAt: string;
  /** Map *id*, not a title — resolve with `mapLabel`. */
  map: string;
  turns: number | null;
  durationSeconds: number | null;
  endCondition: string | null;
  draw: boolean;
  you: AccountGameSeat;
  opponents: AccountGameOpponent[];
}

export interface AccountGamesPage {
  games: AccountGame[];
  /** Opaque cursor for the next (older) page, or null when history is done. */
  nextBefore: string | null;
}

/**
 * Why a page didn't arrive. `unavailable` is the catch-all — telemetry not
 * configured, upstream down, CORS, garbled body — and is the signal to render a
 * calm empty state, not an error.
 */
export type HistoryFailure = "unauthorized" | "rate_limited" | "unavailable";

export type HistoryResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: HistoryFailure };

const fail = (reason: HistoryFailure): HistoryResult<never> => ({
  ok: false,
  reason,
});

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const normalizeOpponent = (raw: unknown): AccountGameOpponent => {
  const row = (raw ?? {}) as Record<string, unknown>;
  return {
    heroId: asString(row.heroId),
    heroName: asString(row.heroName),
    pilot: asString(row.pilot) ?? "human",
    botDifficulty: asString(row.botDifficulty),
  };
};

/**
 * One row → `AccountGame`, or null if it carries no usable identity. A row
 * without an `id` can't be keyed or matched to a replay, so it is dropped
 * rather than rendered as a blank line.
 */
const normalizeGame = (raw: unknown): AccountGame | null => {
  const row = (raw ?? {}) as Record<string, unknown>;
  const id = asString(row.id);
  const endedAt = asString(row.endedAt);
  if (!id || !endedAt) return null;
  const you = (row.you ?? {}) as Record<string, unknown>;
  return {
    id,
    endedAt,
    map: asString(row.map) ?? "",
    turns: asNumber(row.turns),
    durationSeconds: asNumber(row.durationSeconds),
    endCondition: asString(row.endCondition),
    draw: row.draw === true,
    you: {
      heroId: asString(you.heroId),
      heroName: asString(you.heroName),
      won: you.won === true,
      finalHealth: asNumber(you.finalHealth),
    },
    opponents: Array.isArray(row.opponents)
      ? row.opponents.map(normalizeOpponent)
      : [],
  };
};

/** Body → page. Anything that isn't a `games` array is "no history". */
export const normalizeGamesPage = (body: unknown): AccountGamesPage => {
  const root = (body ?? {}) as Record<string, unknown>;
  const games = Array.isArray(root.games)
    ? root.games
        .map(normalizeGame)
        .filter((game): game is AccountGame => game !== null)
    : [];
  return { games, nextBefore: asString(root.nextBefore) };
};

/**
 * One page of the signed-in player's history, newest first.
 *
 * The player id is never sent: the API derives it from the session cookie, so
 * one signed-in player can't page through another's games.
 */
export const fetchAccountGames = async (
  options: { limit?: number; before?: string | null } = {},
): Promise<HistoryResult<AccountGamesPage>> => {
  const params = new URLSearchParams();
  params.set("limit", String(options.limit ?? GAMES_PAGE_SIZE));
  if (options.before) params.set("before", options.before);

  try {
    const res = await fetch(`${API_URL}/me/games?${params.toString()}`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      if (res.status === 401) return fail("unauthorized");
      if (res.status === 429) return fail("rate_limited");
      // 503 (telemetry not configured / upstream down), 500, 4xx we don't
      // model — all one calm "nothing to show".
      return fail("unavailable");
    }
    return { ok: true, value: normalizeGamesPage(await res.json()) };
  } catch {
    return fail("unavailable");
  }
};

// --- presentation helpers ----------------------------------------------------
// Pure, so the row rendering is testable without a DOM.

export type GameOutcome = "win" | "loss" | "draw";

/**
 * A draw is a property of the GAME, a win of the SEAT — telemetry stores them
 * independently, so a draw wins the tie-break rather than being derived.
 */
export const gameOutcome = (game: AccountGame): GameOutcome =>
  game.draw ? "draw" : game.you.won ? "win" : "loss";

export const OUTCOME_LABEL: Record<GameOutcome, string> = {
  win: "Win",
  loss: "Loss",
  draw: "Draw",
};

/** Hero display name, falling back to the id and then to a neutral word. */
export const heroLabel = (
  seat: { heroId: string | null; heroName: string | null } | null | undefined,
): string => seat?.heroName ?? seat?.heroId ?? "Unknown hero";

const TIERS = new Set(["easy", "medium", "hard", "expert"]);

const capitalize = (word: string): string =>
  `${word.charAt(0).toUpperCase()}${word.slice(1)}`;

/**
 * The parenthetical after an opponent's hero: which kind of pilot it was.
 * Humans get nothing — "vs Thrall" already reads as a person.
 *
 * `pilot` is telemetry's raw seat label, and a bot seat carries its bot id in
 * it: `"bot:hard"`, `"bot:gruncle-v2"` — NOT a bare `"bot"` (see
 * unbrewed-telemetry's game-submission schema, `^(human|bot:[^\s]+)$`). The
 * separate `botDifficulty` column is the tier when the producer sent one, and
 * the id suffix is the fallback for older rows that predate it.
 */
export const pilotLabel = (opponent: AccountGameOpponent): string | null => {
  const pilot = opponent.pilot.toLowerCase();
  const suffix = pilot.includes(":")
    ? pilot.slice(pilot.indexOf(":") + 1).trim()
    : "";
  if (pilot.startsWith("llm")) return suffix ? `LLM · ${suffix}` : "LLM";
  if (pilot !== "bot" && !pilot.startsWith("bot:")) return null;
  // Matches the lobby's tier wording (lib/pro/botTiers.ts): "Hard bot".
  const tier = opponent.botDifficulty ?? (TIERS.has(suffix) ? suffix : null);
  return tier ? `${capitalize(tier)} bot` : "Bot";
};

/** "Thrall (Hard bot)" — the full opponent phrase for one seat. */
export const opponentLabel = (opponent: AccountGameOpponent): string => {
  const pilot = pilotLabel(opponent);
  return pilot ? `${heroLabel(opponent)} (${pilot})` : heroLabel(opponent);
};

/** Map id → the catalog's title when we know the board, else the raw id. */
export const mapLabel = (mapId: string): string => {
  if (!mapId) return "Unknown board";
  return catalogEntry(mapId)?.title ?? mapId;
};

/** `end_condition` is snake_case engine vocabulary; make it a phrase. */
export const endConditionLabel = (raw: string | null): string | null =>
  raw ? raw.replace(/[_-]+/g, " ").toLowerCase() : null;

/** "8m 12s" / "1h 04m". Null when telemetry never got a duration. */
export const formatDuration = (seconds: number | null): string | null => {
  if (seconds === null || seconds < 0) return null;
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m ${String(secs).padStart(2, "0")}s`;
  return `${secs}s`;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "just now" / "3h ago" / "yesterday" / "5d ago", and a plain date past a
 * month — a history list is scanned, not read, and an exact timestamp is
 * noise until it's old enough to have lost its relative meaning.
 */
export const relativeDate = (iso: string, now = Date.now()): string => {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  const delta = now - then;
  if (delta < 0) return "just now";
  if (delta < MINUTE) return "just now";
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)}m ago`;
  if (delta < DAY) return `${Math.floor(delta / HOUR)}h ago`;
  const days = Math.floor(delta / DAY);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(then).toISOString().slice(0, 10);
};
