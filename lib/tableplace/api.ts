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

/** Give up on a request after this long. */
export const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Only `details.retry_after_seconds`: the `Retry-After` header isn't exposed
 * to cross-origin scripts without Access-Control-Expose-Headers.
 */
const retryAfter = (details: unknown): number | undefined => {
  const fromDetails = (details as { retry_after_seconds?: unknown } | null)
    ?.retry_after_seconds;
  return typeof fromDetails === "number" && fromDetails > 0
    ? fromDetails
    : undefined;
};

const failure = (
  status: number,
  code: string,
  message: string,
  retryable: boolean,
): ApiResult<never> => ({
  ok: false,
  error: { status, code, message, retryable },
});

const isCreated = (j: unknown): boolean => {
  const o = j as LobbyCreated | null;
  return (
    !!o &&
    typeof o === "object" &&
    Array.isArray(o.seats) &&
    o.seats.every(
      (s) => !!s && typeof s.seat === "number" && typeof s.url === "string",
    )
  );
};

const isValidated = (j: unknown): boolean =>
  !!j &&
  typeof j === "object" &&
  typeof (j as LobbyValidated).valid === "boolean";

const post = async <T>(
  path: string,
  body: unknown,
  fetchImpl: typeof fetch,
  isShape: (json: unknown) => boolean,
): Promise<ApiResult<T>> => {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  let res: Response;
  let json: any = null;
  try {
    res = await fetchImpl(`${TABLEPLACE_API}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    json = await res.json().catch(() => null);
  } catch {
    return timedOut
      ? failure(0, "timeout", "table.place didn't answer.", true)
      : failure(
          0,
          "network",
          "Couldn't reach table.place. Check your connection.",
          true,
        );
  } finally {
    clearTimeout(timer);
  }
  if (res.ok) {
    return isShape(json)
      ? { ok: true, data: json as T }
      : failure(
          res.status,
          "bad_response",
          "table.place sent back something we didn't understand.",
          false,
        );
  }
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
        ? { retryAfterSeconds: retryAfter(json?.details) }
        : {}),
    },
  };
};

/** The dry run: same validation, no lobby, nothing spent from the shared cap. */
export const validateLobby = (body: LobbyRequest, fetchImpl = fetch) =>
  post<LobbyValidated>("/v1/lobbies/validate", body, fetchImpl, isValidated);

export const createLobby = (body: LobbyRequest, fetchImpl = fetch) =>
  post<LobbyCreated>("/v1/lobbies", body, fetchImpl, isCreated);

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

/** A 4xx we can't fix by retrying: our body was wrong, so it's our bug. */
export const isOurBug = (error: TablePlaceError) =>
  !error.retryable && error.code !== "bad_response";
