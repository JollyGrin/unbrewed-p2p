/**
 * Cloud replay storage + public share links (#567), against the accounts API
 * (`unbrewed-api`, see lib/account/apiUrl.ts). Strictly additive to the local
 * store in replayStore.ts: a replay always lives in this browser first, and
 * uploading only mints an extra, shareable copy.
 *
 * Contract (cookie auth, `credentials: "include"`):
 *   POST   /replays        {title?, bundle} → 201 {id} | 409 {error:"cap_reached",cap} | 413
 *   GET    /replays        → {replays:[{id,title,bytes,createdAt}]}
 *   DELETE /replays/:id    → 204
 *   GET    /share/replays/:id  → {id,title,bundle,createdAt}   (PUBLIC, no auth)
 *
 * Every call resolves — never throws — so a dead or unconfigured API degrades
 * the replays page to exactly what it is without accounts. Failures carry a
 * `reason` (for tests and for branching) plus a ready-to-toast `message`.
 */
import { API_URL } from "@/lib/account/apiUrl";
import type { ReplayBundle } from "./protocol";

/** Server-side per-user cap; mirrored here only to render "N/50" and messages. */
export const CLOUD_REPLAY_CAP = 50;
/** Server-side per-bundle byte cap (2 MB); checked locally to skip a doomed POST. */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export interface CloudReplaySummary {
  id: string;
  title: string | null;
  bytes: number;
  createdAt: string;
}

export interface SharedReplay {
  id: string;
  title: string | null;
  bundle: ReplayBundle;
  createdAt: string;
}

export type CloudFailureReason =
  | "unauthorized"
  | "cap_reached"
  | "too_large"
  | "rate_limited"
  | "not_found"
  | "invalid"
  | "offline";

export interface CloudFailure {
  ok: false;
  reason: CloudFailureReason;
  /** Ready to drop into a toast / error panel. */
  message: string;
}

export type CloudResult<T> = ({ ok: true } & T) | CloudFailure;

/** One place for the user-facing wording, so toasts and tests agree. */
const MESSAGES: Record<CloudFailureReason, string> = {
  unauthorized: "You're signed out — sign in with Discord to upload replays.",
  cap_reached: `Your cloud replays are full (${CLOUD_REPLAY_CAP}). Delete one to upload another.`,
  too_large: "That replay is too big to upload (over 2 MB). Share the .json file instead.",
  rate_limited: "Too many requests just now — wait a few seconds and try again.",
  not_found: "That replay link is no longer available — it may have been deleted.",
  invalid: "The server sent back something we couldn't read.",
  offline: "Couldn't reach the account service.",
};

const fail = (reason: CloudFailureReason, message?: string): CloudFailure => ({
  ok: false,
  reason,
  message: message ?? MESSAGES[reason],
});

/** Map a non-2xx response onto a reason, preferring the body's `{error}` code. */
const failureFor = (status: number, body: unknown): CloudFailure => {
  const code = (body as { error?: unknown } | null)?.error;
  if (code === "cap_reached") return fail("cap_reached");
  if (code === "too_large") return fail("too_large");
  if (code === "rate_limited") return fail("rate_limited");
  if (status === 401 || status === 403) return fail("unauthorized");
  if (status === 404) return fail("not_found");
  if (status === 409) return fail("cap_reached");
  if (status === 413) return fail("too_large");
  if (status === 429) return fail("rate_limited");
  return fail("offline", `The account service returned an error (HTTP ${status}).`);
};

/** JSON body or null; a share read of a 404 page shouldn't blow up on parse. */
const readJson = async (res: Response): Promise<unknown> => {
  try {
    return await res.json();
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// share links

/** Path half of a share link, so tests don't depend on an origin. */
export const shareReplayPath = (id: string): string => `/share/replay/${id}`;

/**
 * Absolute share URL for a cloud replay. Built from the page's own origin, so a
 * link copied on localhost points at localhost and one copied on unbrewed.xyz
 * points at production.
 */
export const shareReplayUrl = (id: string, origin?: string): string => {
  const base =
    origin ?? (typeof window !== "undefined" ? window.location.origin : "https://unbrewed.xyz");
  return `${base}${shareReplayPath(id)}`;
};

// ---------------------------------------------------------------------------
// authenticated calls

/**
 * Upload a bundle. `title` is optional; the caller passes the local replay's
 * label. Returns the new id plus its share URL.
 */
export async function uploadReplay(input: {
  bundle: ReplayBundle;
  title?: string | null;
  origin?: string;
}): Promise<CloudResult<{ id: string; url: string }>> {
  const serialized = JSON.stringify(input.bundle);
  // The server answers 413 anyway; refusing here saves pushing 2 MB uphill.
  if (byteLength(serialized) > MAX_UPLOAD_BYTES) return fail("too_large");

  let res: Response;
  try {
    res = await fetch(`${API_URL}/replays`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ title: input.title ?? null, bundle: input.bundle }),
    });
  } catch {
    return fail("offline");
  }
  const body = await readJson(res);
  if (!res.ok) return failureFor(res.status, body);
  const id = (body as { id?: unknown } | null)?.id;
  if (typeof id !== "string" || !id) return fail("invalid");
  return { ok: true, id, url: shareReplayUrl(id, input.origin) };
}

/** The signed-in user's cloud replays, newest first. Never carries bundles. */
export async function listCloudReplays(): Promise<CloudResult<{ replays: CloudReplaySummary[] }>> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/replays`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
  } catch {
    return fail("offline");
  }
  const body = await readJson(res);
  if (!res.ok) return failureFor(res.status, body);
  const raw = (body as { replays?: unknown } | null)?.replays;
  if (!Array.isArray(raw)) return fail("invalid");
  return { ok: true, replays: raw.filter(isSummary) };
}

export async function deleteCloudReplay(id: string): Promise<{ ok: true } | CloudFailure> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/replays/${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
  } catch {
    return fail("offline");
  }
  if (!res.ok) return failureFor(res.status, await readJson(res));
  return { ok: true };
}

// ---------------------------------------------------------------------------
// public share read

/**
 * Read a shared replay by id. PUBLIC — no cookie is sent, so this works for a
 * signed-out recipient on a clean browser profile. The bundle is returned
 * unvalidated: the caller runs it through the engine's /replay (the same gate
 * every imported bundle passes) before rendering anything.
 */
export async function fetchSharedReplay(id: string): Promise<CloudResult<{ replay: SharedReplay }>> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/share/replays/${encodeURIComponent(id)}`, {
      headers: { Accept: "application/json" },
    });
  } catch {
    return fail("offline");
  }
  const body = await readJson(res);
  if (!res.ok) return failureFor(res.status, body);
  const record = body as Partial<SharedReplay> | null;
  if (!record || typeof record !== "object" || !record.bundle) return fail("invalid");
  return {
    ok: true,
    replay: {
      id: typeof record.id === "string" ? record.id : id,
      title: typeof record.title === "string" ? record.title : null,
      bundle: record.bundle as ReplayBundle,
      createdAt: typeof record.createdAt === "string" ? record.createdAt : "",
    },
  };
}

// ---------------------------------------------------------------------------

const isSummary = (value: unknown): value is CloudReplaySummary =>
  !!value && typeof value === "object" && typeof (value as CloudReplaySummary).id === "string";

const byteLength = (s: string) =>
  typeof TextEncoder !== "undefined" ? new TextEncoder().encode(s).length : s.length;
