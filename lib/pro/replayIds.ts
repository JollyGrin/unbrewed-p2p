/**
 * Telling the two replay id namespaces apart (#698).
 *
 * A replay can be addressed two ways, and the ids look nothing alike:
 *
 *  - LOCAL — `replayId()` in replayStore.ts, an FNV-1a content hash rendered as
 *    `r` + 8 hex digits (`r80279f0e`). It only means anything inside the browser
 *    that played (or imported) the match: /pro/replays?open=<id> is a deep-link
 *    into localStorage, not a share link.
 *  - CLOUD — the uuid the accounts API mints on `POST /replays` (#567), which
 *    anyone can open at `/share/replay/<uuid>`.
 *
 * The shapes are provably disjoint (a uuid is 36 chars with dashes and never
 * starts with `r`), so a bare id can be routed to the right loader with no
 * guessing — which is what stops a pasted share id from silently missing in the
 * local store and vice versa.
 */

/** `r` + 8 hex — what `replayId()` emits. Case-insensitive to be forgiving of
 *  ids that made a round trip through something that upper-cased them. */
export const LOCAL_REPLAY_ID_RE = /^r[0-9a-f]{8}$/i;

/** Canonical uuid (any version) — what the accounts API mints for a share link. */
export const CLOUD_REPLAY_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ReplayIdKind = "local" | "cloud" | "unknown";

/**
 * Which loader an id belongs to. `unknown` is neither shape — a truncated
 * paste, say — and callers treat it like a local miss: the local store is the
 * only one that can be probed for free.
 */
export const classifyReplayId = (id: string): ReplayIdKind => {
  const trimmed = id.trim();
  if (CLOUD_REPLAY_ID_RE.test(trimmed)) return "cloud";
  if (LOCAL_REPLAY_ID_RE.test(trimmed)) return "local";
  return "unknown";
};

export const isCloudReplayId = (id: string): boolean => classifyReplayId(id) === "cloud";
export const isLocalReplayId = (id: string): boolean => classifyReplayId(id) === "local";
