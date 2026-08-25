/**
 * Cloud replay storage + public share links (#567), against the accounts API
 * (`unbrewed-api`, see lib/account/apiUrl.ts). Strictly additive to the local
 * store in replayStore.ts: a replay always lives in this browser first, and
 * uploading only mints an extra, shareable copy.
 *
 * Contract (cookie auth, `credentials: "include"`):
 *   POST   /replays        {title?, bundle} → 201 {id} | 409 {error:"cap_reached",cap} | 413
 *     ("bundle" is stored opaquely, so since #701 it also carries the expanded
 *      `frames` — no api-side schema change, see lib/pro/replayFrames.ts)
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
import type { BundleWithFrames, ReplayFrames } from "./replayFrames";

/** Server-side per-user cap; mirrored here only to render "N/50" and messages. */
export const CLOUD_REPLAY_CAP = 50;
/**
 * Server-side per-bundle byte cap (2 MB — `MAX_BUNDLE_BYTES` in unbrewed-api's
 * http/replays.ts); checked locally to skip a doomed POST. Embedded `frames`
 * count toward it: a measured 27-turn / 187-action game is 26 KB of bundle plus
 * 437 KB of frames, so the cap allows roughly four such games' worth of frames
 * before the fallback in `uploadReplay` drops them (#701).
 */
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
  /**
   * As stored — which for an upload since #701 also carries `frames`, the
   * God-view steps frozen in at upload time. The api treats the bundle as an
   * opaque blob, so the extra key needs no schema change on its side; the reader
   * validates it with `readFrames`.
   */
  bundle: BundleWithFrames;
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
 *
 * `frames` (#701) is the expansion frozen in at upload time so the share link
 * renders forever, engine version rot or not. It rides INSIDE the bundle, which
 * the api stores as an opaque blob — no api change, and an api that never heard
 * of frames hands them straight back. Frames are a durability bonus, never a
 * reason a share fails: if the payload wouldn't fit under the size cap they are
 * dropped and the bundle uploads on its own, exactly as before.
 */
export async function uploadReplay(input: {
  bundle: ReplayBundle;
  title?: string | null;
  frames?: ReplayFrames | null;
  origin?: string;
}): Promise<CloudResult<{ id: string; url: string; framesIncluded: boolean; bytes: number }>> {
  const withFrames: BundleWithFrames | null = input.frames
    ? { ...input.bundle, frames: input.frames }
    : null;

  // The server answers 413 anyway; refusing here saves pushing 2 MB uphill.
  let bundle: BundleWithFrames = input.bundle;
  let bytes = byteLength(JSON.stringify(bundle));
  let framesIncluded = false;
  if (withFrames) {
    const framedBytes = byteLength(JSON.stringify(withFrames));
    if (framedBytes <= MAX_UPLOAD_BYTES) {
      bundle = withFrames;
      bytes = framedBytes;
      framesIncluded = true;
    }
  }
  if (bytes > MAX_UPLOAD_BYTES) return fail("too_large");

  let res: Response;
  try {
    res = await fetch(`${API_URL}/replays`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ title: input.title ?? null, bundle }),
    });
  } catch {
    return fail("offline");
  }
  const body = await readJson(res);
  if (!res.ok) return failureFor(res.status, body);
  const id = (body as { id?: unknown } | null)?.id;
  if (typeof id !== "string" || !id) return fail("invalid");
  return { ok: true, id, url: shareReplayUrl(id, input.origin), framesIncluded, bytes };
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
 * unvalidated: the caller either plays the `frames` frozen in at upload time
 * (#701) or runs the bundle through the engine's /replay — the same gate every
 * imported bundle passes — before rendering anything.
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
