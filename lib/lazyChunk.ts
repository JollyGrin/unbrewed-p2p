/**
 * Lazy chunks that survive a failed load (p2p #1605).
 *
 * A webpack `ChunkLoadError` has two common causes on this static GitHub Pages
 * site: a tab opened before a deploy asks for a hashed file Pages no longer
 * has (`error`), or a big chunk on a slow line misses webpack's 120 s limit
 * (`timeout`). `loadChunk` retries once after CHUNK_RETRY_MS; if that fails
 * too it asks the server whether a newer build is out (there is no API to ask,
 * so it compares the `buildId` in the page's own HTML) and only then flags the
 * page stale. It always rejects with the original error so the caller can fall
 * back (icons stay off, dice show only the banner), and it never caches a
 * rejection: the next call starts a fresh import.
 *
 * A chunk failure never reloads the page by itself, on any page: the banner's
 * Reload button is enough, and an automatic reload would throw away whatever
 * the player had open (the deck token editor on /bag, a game on /game).
 */
import { trackOncePerPageLoad } from "@/lib/analyticsErrors";
import { isClientStale, markStale } from "@/lib/staleClient";

export const CHUNK_RETRY_MS = 2000;

const CHUNK_MESSAGE = /Loading (?:CSS )?chunk (\S+) failed/;

/** Webpack's `ChunkLoadError` (by name, or by message for wrapped copies). */
export const isChunkLoadError = (err: unknown): boolean => {
  if (!err || typeof err !== "object") return false;
  const { name, message } = err as { name?: unknown; message?: unknown };
  return name === "ChunkLoadError" || (typeof message === "string" && CHUNK_MESSAGE.test(message));
};

/**
 * `timeout`: the script did not finish in time. Everything else webpack
 * reports (`error`, `missing`) is a failed request: `error`.
 */
export const chunkFailureVariant = (err: unknown): "error" | "timeout" => {
  const { type, message } = (err ?? {}) as { type?: unknown; message?: unknown };
  if (type === "timeout") return "timeout";
  return typeof message === "string" && /\(timeout: /.test(message) ? "timeout" : "error";
};

/** The chunk id from webpack's message ("Loading chunk 4980 failed."). */
export const chunkIdOf = (err: unknown): string => {
  const message = (err as { message?: unknown } | null)?.message;
  const m = typeof message === "string" ? CHUNK_MESSAGE.exec(message) : null;
  return m?.[1] ?? "unknown";
};

/** The `buildId` in a Next page's `__NEXT_DATA__` script, or null. */
export const readBuildId = (html: string): string | null => {
  const m = /<script[^>]*\bid="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) return null;
  try {
    const id = JSON.parse(m[1])?.buildId;
    return typeof id === "string" && id ? id : null;
  } catch {
    return null;
  }
};

const runningBuildId = (): string | null => {
  const id = (window as unknown as { __NEXT_DATA__?: { buildId?: unknown } }).__NEXT_DATA__?.buildId;
  return typeof id === "string" && id ? id : null;
};

let pendingCheck: Promise<boolean> | null = null;

/**
 * Is a newer build deployed than the one this tab runs? Fetches the current
 * page's HTML past every cache and compares its `buildId` with ours (Next makes
 * a new one per build; next.config.js does not pin it). Any doubt — no build id
 * on either side, a failed or non-OK fetch, unparsable HTML — is "not stale".
 * Concurrent callers share one request.
 */
export const checkForNewBuild = (): Promise<boolean> => {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (pendingCheck) return pendingCheck;
  const check = (async () => {
    try {
      const current = runningBuildId();
      if (!current) return false;
      const res = await fetch(window.location.href, { cache: "no-store", credentials: "same-origin" });
      if (!res.ok) return false;
      const served = readBuildId(await res.text());
      return served !== null && served !== current;
    } catch {
      return false;
    }
  })();
  // Cleared once settled (never in the IIFE: one that settles without awaiting
  // would clear it before it is assigned). The next failure asks again.
  pendingCheck = check;
  void check.then(() => {
    if (pendingCheck === check) pendingCheck = null;
  });
  return pendingCheck;
};

/**
 * Once per chunk per page load, plus once more for that chunk's first stale
 * verdict: a failure first reported as recovered or not stale must not hide a
 * later one that finds a newer build.
 */
const report = (err: unknown, stale: boolean, recovered: boolean) =>
  trackOncePerPageLoad(`chunk_load_failed:${chunkIdOf(err)}${stale ? ":stale" : ""}`, "chunk_load_failed", {
    chunk: chunkIdOf(err),
    variant: chunkFailureVariant(err),
    stale,
    recovered,
  });

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * `load` is the caller's `() => import("…")`, so webpack still splits it.
 * Errors that are not chunk-load failures pass straight through, unretried.
 */
export async function loadChunk<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (first) {
    if (!isChunkLoadError(first)) throw first;
    await delay(CHUNK_RETRY_MS);
    try {
      const mod = await load();
      report(first, false, true);
      return mod;
    } catch (second) {
      if (!isChunkLoadError(second)) throw second;
      const stale = isClientStale() || (await checkForNewBuild());
      report(second, stale, false);
      if (stale) markStale("build", null);
      throw first;
    }
  }
}
