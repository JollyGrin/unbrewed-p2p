/**
 * Cloud bag transport (issue #566) — the fetch layer for `/bag/*` and
 * `/share/*` on the accounts API (unbrewed-api ticket 8).
 *
 * Decks and custom maps otherwise live only in localStorage, so they die with
 * the browser profile and cannot be handed to a friend. This module is the ONLY
 * place that talks to those routes, and it holds to the same contract as the
 * `/me` probe in useAccount: it never throws, never logs, and turns every
 * failure — 4xx, 5xx, CORS, DNS, `fetch` missing entirely — into a typed
 * `reason` the caller can render as a sentence. A dead API must leave the Bag
 * behaving exactly as it does today.
 *
 * Sync is explicit, never automatic: nothing here runs on a timer or merges
 * anything. The user presses a button, one request happens.
 */
import { API_URL } from "./apiUrl";

/** The two bag surfaces. Matches the API's path segment verbatim. */
export type BagKind = "decks" | "maps";

/**
 * Serialized `data` cap for a single item; over it the server answers 413.
 *
 * There is deliberately NO client mirror of an item COUNT cap any more (#644):
 * the account is the bag for a signed-in user, so the number of decks they may
 * keep is the server's business alone (unbrewed-api#38 removed it). A pre-#38
 * API still answers 409 on the 101st item, and that lands as `cap_reached` like
 * any other refusal — the item simply stays on the device.
 */
export const MAX_ITEM_BYTES = 256 * 1024;

/** A listing row — metadata only, never the payload. */
export type CloudBagItem = {
  id: string;
  name: string;
  /** Serialized size of `data`, so quota can be shown without downloading it. */
  bytes: number;
  createdAt: string;
  updatedAt: string;
};

/** A full item, from the owner's read or the public share read. */
export type CloudBagPayload = {
  id: string;
  name: string;
  data: unknown;
};

/**
 * Why a call didn't succeed. `offline` is the catch-all for "we never got an
 * answer we understand" (network failure, CORS, 5xx, garbled body) and is the
 * signal to hide cloud UI rather than show an error.
 */
export type CloudFailure =
  | "cap_reached"
  | "too_large"
  | "unauthorized"
  | "not_found"
  | "rate_limited"
  | "offline";

export type CloudResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: CloudFailure };

const fail = (reason: CloudFailure): CloudResult<never> => ({
  ok: false,
  reason,
});

/** Friendly, non-technical copy for a toast. Never mentions status codes. */
export const cloudFailureMessage = (reason: CloudFailure): string => {
  switch (reason) {
    case "cap_reached":
      return "Your account bag is full — this one stayed on this device.";
    case "too_large":
      return "That one is too big for the cloud bag (256 KB limit). Image decks should use URLs, not embedded images.";
    case "unauthorized":
      return "Your sign-in expired — sign in again to sync.";
    case "not_found":
      return "That item is no longer in your cloud bag.";
    case "rate_limited":
      return "Too many changes at once. Give it a few seconds and try again.";
    case "offline":
      return "Couldn't reach your account right now. Your bag is safe in this browser.";
  }
};

/** HTTP status + body → typed reason. Unknown shapes fall through to offline. */
const failureFrom = (status: number, body: unknown): CloudFailure => {
  const code =
    body && typeof body === "object" && typeof (body as any).error === "string"
      ? ((body as any).error as string)
      : "";
  if (status === 401) return "unauthorized";
  if (status === 404) return "not_found";
  if (status === 409) return code === "cap_reached" ? "cap_reached" : "offline";
  if (status === 413) return "too_large";
  if (status === 429) return "rate_limited";
  return "offline";
};

/**
 * One request. `credentials: "include"` because the session is a cookie on the
 * API's own host; `share` reads pass `authed: false` so a signed-out visitor
 * takes the identical code path.
 */
const request = async <T>(
  path: string,
  init: RequestInit & { authed?: boolean } = {},
): Promise<CloudResult<T>> => {
  const { authed = true, ...rest } = init;
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...rest,
      ...(authed ? { credentials: "include" } : {}),
      headers: {
        Accept: "application/json",
        ...(rest.body ? { "Content-Type": "application/json" } : {}),
        ...rest.headers,
      },
    });
    if (!res.ok) {
      // The body is best-effort: the reason mapping works from the status alone
      // when there's nothing parseable there (a proxy's HTML error page, say).
      const body = await res.json().catch(() => null);
      return fail(failureFrom(res.status, body));
    }
    // 204 (DELETE) has no body; callers of those ignore the value.
    if (res.status === 204) return { ok: true, value: null as T };
    const body = await res.json().catch(() => null);
    if (body === null) return fail("offline");
    return { ok: true, value: body as T };
  } catch {
    return fail("offline");
  }
};

/** `{decks:[…]}` / `{maps:[…]}` → the array, dropping rows missing an id. */
const readListBody = (kind: BagKind, body: unknown): CloudBagItem[] => {
  const rows = (body as any)?.[kind];
  if (!Array.isArray(rows)) return [];
  return rows.filter(
    (row): row is CloudBagItem =>
      !!row && typeof row.id === "string" && typeof row.name === "string",
  );
};

export const listCloudItems = async (
  kind: BagKind,
): Promise<CloudResult<CloudBagItem[]>> => {
  const res = await request<unknown>(`/bag/${kind}`);
  if (!res.ok) return res;
  return { ok: true, value: readListBody(kind, res.value) };
};

export const createCloudItem = async (
  kind: BagKind,
  name: string,
  data: unknown,
): Promise<CloudResult<{ id: string }>> => {
  const res = await request<{ id?: unknown }>(`/bag/${kind}`, {
    method: "POST",
    body: JSON.stringify({ name, data }),
  });
  if (!res.ok) return res;
  return typeof res.value?.id === "string"
    ? { ok: true, value: { id: res.value.id } }
    : fail("offline");
};

export const updateCloudItem = async (
  kind: BagKind,
  id: string,
  name: string,
  data: unknown,
): Promise<CloudResult<{ id: string }>> => {
  const res = await request<unknown>(`/bag/${kind}/${id}`, {
    method: "PUT",
    body: JSON.stringify({ name, data }),
  });
  if (!res.ok) return res;
  return { ok: true, value: { id } };
};

/** One row of a bulk import: the same `{name, data}` a single create takes. */
export type BulkImportItem = { name: string; data: unknown };

/**
 * Move a whole local bag up in one request (unbrewed-api#38, `POST /bag/import`).
 *
 * The client must ALSO work against the pre-#38 API, which has no such route
 * and answers 404 — so this is strictly best-effort and its body is never
 * trusted: the migration re-lists afterwards and decides what actually landed
 * from the server's own listing. That makes a 404, a partial apply and a
 * mid-flight network drop all recoverable by the same per-item follow-up loop,
 * with no risk of uploading anything twice.
 */
export const bulkImportCloudItems = async (payload: {
  decks: BulkImportItem[];
  maps: BulkImportItem[];
}): Promise<CloudResult<null>> => {
  const res = await request<unknown>("/bag/import", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return res.ok ? { ok: true, value: null } : res;
};

export const deleteCloudItem = async (
  kind: BagKind,
  id: string,
): Promise<CloudResult<null>> =>
  request<null>(`/bag/${kind}/${id}`, { method: "DELETE" });

/** The owner's read of one item, payload included. */
export const readCloudItem = async (
  kind: BagKind,
  id: string,
): Promise<CloudResult<CloudBagPayload>> => {
  const res = await request<any>(`/bag/${kind}/${id}`);
  if (!res.ok) return res;
  return res.value && "data" in res.value
    ? { ok: true, value: res.value as CloudBagPayload }
    : fail("offline");
};

/**
 * The public share read — no auth, no cookies. Access control is possession of
 * the link: ids are unguessable uuids and unknown ones 404.
 */
export const fetchSharedItem = async (
  kind: BagKind,
  id: string,
): Promise<CloudResult<CloudBagPayload>> => {
  const res = await request<any>(`/share/${kind}/${encodeURIComponent(id)}`, {
    authed: false,
  });
  if (!res.ok) return res;
  return res.value && "data" in res.value
    ? { ok: true, value: res.value as CloudBagPayload }
    : fail("offline");
};

/** Canonical site origin, for share links minted where `window` isn't around. */
const CANONICAL_ORIGIN = "https://unbrewed.xyz";

/**
 * The full share URL to hand a friend, e.g.
 * `https://unbrewed.xyz/share/deck/<id>`. Built from the live origin so a
 * link copied on a preview build or on localhost points back at that build;
 * on the deployed site the origin *is* unbrewed.xyz.
 *
 * Note the singular path segment (`/share/deck/…`), which is the client route —
 * the API's plural `/share/decks/:id` is an implementation detail behind it.
 */
export const shareUrl = (kind: BagKind, id: string): string => {
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : CANONICAL_ORIGIN;
  return `${origin}/share/${kind === "decks" ? "deck" : "map"}/${id}`;
};

/** `1.2 KB` / `240 KB` — quota copy that fits in a table cell. */
export const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
};

/** `2026-08-06` — short, unambiguous, and locale-independent for snapshots. */
export const formatStamp = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toISOString().slice(0, 10);
};
