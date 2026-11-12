/**
 * Stale client: this tab runs an out-of-date bundle and a reload would fix it.
 * Two things can tell us so:
 *
 * - `protocol` (p2p #1549): a Pro engine socket answered ERROR{VERSION} with a
 *   newer protocol version (`lib/pro/staleClient.ts`).
 * - `build` (p2p #1605): a lazy chunk failed to load twice and the page's HTML
 *   on the server now names a different Next `buildId` (`lib/lazyChunk.ts`).
 *   Banner only: this reason never reloads by itself.
 *
 * One page-wide sticky flag, read by `<StaleClientBanner />` mounted in _app, so
 * every surface shows the same banner without each page wiring it.
 *
 * Auto-reload only when the caller says nothing is lost by it and the tab is
 * visible, at most once per RELOAD_GUARD_MS per tab (only `protocol` asks): a
 * GitHub Pages cache that serves the old bundle for a few minutes after a
 * deploy must not turn into a reload loop.
 */
import { useSyncExternalStore } from "react";

export type StaleReason = "protocol" | "build";

export const RELOAD_GUARD_MS = 10 * 60 * 1000;
export const RELOAD_GUARD_KEY = "unbrewed-pro-stale-reload-at";

let stale = false;
const reasons = new Set<StaleReason>();
const listeners = new Set<() => void>();

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const getServerSnapshot = () => false;

/**
 * True once anything on this page found the bundle out of date, or, given a
 * `reason`, once that reason did. The banner reads any reason; Pro sockets
 * read only `protocol` ("the engine refuses us"): a build-stale page can
 * still talk to the engine.
 */
export const isClientStale = (reason?: StaleReason): boolean => (reason ? reasons.has(reason) : stale);

/** React view of {@link isClientStale}; false during SSR/hydration. */
export const useClientStale = (reason?: StaleReason): boolean =>
  useSyncExternalStore(subscribe, () => isClientStale(reason), getServerSnapshot);

/** Indirection so tests can observe a reload (jsdom's location.reload is not configurable). */
export const reloadPage = {
  run: (): void => {
    window.location.reload();
  },
};

/**
 * Reload now if the guard allows it: no auto-reload in the last RELOAD_GUARD_MS
 * for this tab. Returns whether it reloaded. Unreadable sessionStorage (private
 * mode, blocked storage) means no guard, so no reload — a loop is the worse risk.
 */
export const reloadIfGuardAllows = (now = Date.now()): boolean => {
  if (typeof window === "undefined") return false;
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_GUARD_KEY));
    if (Number.isFinite(last) && last > 0 && now - last < RELOAD_GUARD_MS) return false;
    window.sessionStorage.setItem(RELOAD_GUARD_KEY, String(now));
  } catch {
    return false;
  }
  reloadPage.run();
  return true;
};

/**
 * Flag the page stale (sticky until reload). `onFirst` runs the first time this
 * `reason` is reported on this page (its analytics event; it must not throw
 * past here). `canAutoReload` is the caller's "nothing is lost" verdict; the tab
 * must also be visible, and a hidden tab reloads when it next becomes visible.
 * `null`: this reason never reloads by itself, so nothing is armed at all.
 * Every call may try to reload; the guard keeps it to once per 10 minutes.
 * Returns a disposer for that pending visibility listener: call it on unmount.
 */
export const markStale = (
  reason: StaleReason,
  canAutoReload: (() => boolean) | null,
  onFirst?: () => void,
): (() => void) => {
  const noop = () => {};
  if (typeof window === "undefined") return noop;
  const firstForReason = !reasons.has(reason);
  if (firstForReason) {
    reasons.add(reason);
    try {
      onFirst?.();
    } catch {
      /* analytics must never break the caller */
    }
  }
  if (!stale || firstForReason) {
    stale = true;
    listeners.forEach((fn) => fn());
  }
  if (!canAutoReload) return noop;
  const tryReload = () => {
    if (document.visibilityState !== "visible") return false;
    if (canAutoReload()) reloadIfGuardAllows();
    return true;
  };
  if (tryReload()) return noop;
  const dispose = () => document.removeEventListener("visibilitychange", onVisible);
  const onVisible = () => {
    if (tryReload()) dispose();
  };
  document.addEventListener("visibilitychange", onVisible);
  return dispose;
};

/** Tests only: a fresh page. */
export const resetClientStale = (): void => {
  stale = false;
  reasons.clear();
  listeners.forEach((fn) => fn());
};
