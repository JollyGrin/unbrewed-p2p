/**
 * The two api.table.place calls the /table page makes (issue #1008): the dry
 * run, then the real lobby. CORS is open (llms.txt §9), so the static site
 * POSTs straight from the browser. We never send `lobby`: the namespace is
 * global and first-come, so a readable name is probably taken (§4).
 */
import type { LobbyRequest } from "./types";

export const TABLEPLACE_API = "https://api.table.place";

/** The relay reaps a lobby nobody is in after about this long (§7). */
export const EMPTY_LOBBY_REAP_MINUTES = 15;
/** Asked for, but the empty-lobby reap usually ends a lobby first. */
export const LOBBY_TTL_SECONDS = 4 * 60 * 60;

export type LobbySeat = { seat: number; url: string };

export type LobbyCreated = {
  lobby: string;
  lobby_url: string;
  seats: LobbySeat[];
  expires_at: string;
};

export type LobbyValidated = {
  valid: boolean;
  provisioned: false;
  ttl_seconds: number;
};

export type TablePlaceError = {
  status: number;
  /** The API's `error` code, or ours for a network failure. */
  code: string;
  /** The API's own `message`: written as a diagnosis, shown as-is. */
  message: string;
  /** A 429 or 5xx (or no answer at all): the same body may work later. */
  retryable: boolean;
  retryAfterSeconds?: number;
};

export type ApiResult<T> =
  { ok: true; data: T } | { ok: false; error: TablePlaceError };

const retryAfter = (res: Response, details: unknown): number | undefined => {
  const fromDetails = (details as { retry_after_seconds?: unknown } | null)
    ?.retry_after_seconds;
  if (typeof fromDetails === "number") return fromDetails;
  const header = Number(res.headers.get("retry-after"));
  return Number.isFinite(header) && header > 0 ? header : undefined;
};

const post = async <T>(
  path: string,
  body: unknown,
  fetchImpl: typeof fetch,
): Promise<ApiResult<T>> => {
  let res: Response;
  try {
    res = await fetchImpl(`${TABLEPLACE_API}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return {
      ok: false,
      error: {
        status: 0,
        code: "network",
        message: "Couldn't reach table.place. Check your connection.",
        retryable: true,
      },
    };
  }
  const json = await res.json().catch(() => null);
  if (res.ok) return { ok: true, data: json as T };
  const retryable = res.status === 429 || res.status >= 500;
  return {
    ok: false,
    error: {
      status: res.status,
      code: typeof json?.error === "string" ? json.error : `http_${res.status}`,
      message:
        typeof json?.message === "string"
          ? json.message
          : `table.place answered ${res.status}.`,
      retryable,
      ...(res.status === 429
        ? { retryAfterSeconds: retryAfter(res, json?.details) }
        : {}),
    },
  };
};

/** The dry run: same validation, no lobby, nothing spent from the shared cap. */
export const validateLobby = (body: LobbyRequest, fetchImpl = fetch) =>
  post<LobbyValidated>("/v1/lobbies/validate", body, fetchImpl);

export const createLobby = (body: LobbyRequest, fetchImpl = fetch) =>
  post<LobbyCreated>("/v1/lobbies", body, fetchImpl);

/** What to tell a player after a failure they can retry. */
export const retryCopy = (error: TablePlaceError): string | null => {
  if (!error.retryable) return null;
  if (error.status === 429) {
    const wait = error.retryAfterSeconds;
    return wait
      ? `table.place is busy. Try again in ${wait < 90 ? `${wait} seconds` : `${Math.ceil(wait / 60)} minutes`}.`
      : "table.place is busy. Try again in a minute.";
  }
  if (error.status === 0) return "Try again once you're back online.";
  return "table.place had a problem on its side. Try again in a moment.";
};
