/**
 * Stale client (p2p #1549): this tab's bundle speaks a protocol version the
 * engine no longer accepts, so it answered ERROR{VERSION}. Nothing this tab
 * sends will ever be accepted again; reloading picks up the new bundle.
 *
 * One page-wide sticky flag, set by every Pro socket (useProSocket and the
 * one-shot roster fetch), read by `<StaleClientBanner />` mounted in _app — so
 * every surface shows the same banner without each page wiring it.
 *
 * Auto-reload only when nothing is lost by it (no seat, no game on screen) and
 * the tab is visible, at most once per RELOAD_GUARD_MS per tab: a GitHub Pages
 * cache that serves the old bundle for a few minutes after a deploy must not
 * turn into a reload loop.
 */
import { useSyncExternalStore } from "react";
import { track } from "@/lib/analytics";
import { PROTOCOL_VERSION } from "./protocol";

export const RELOAD_GUARD_MS = 10 * 60 * 1000;
export const RELOAD_GUARD_KEY = "unbrewed-pro-stale-reload-at";

let stale = false;
const listeners = new Set<() => void>();

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const getSnapshot = () => stale;
const getServerSnapshot = () => false;

/** True once any Pro socket on this page was refused for its protocol version. */
export const isClientStale = (): boolean => stale;

/** React view of {@link isClientStale}; false during SSR/hydration. */
export const useClientStale = (): boolean => useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

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
 * Flag the page stale (sticky until reload). `messageType` is the last frame
 * this socket sent — ERROR frames don't say which request they answer.
 * `canAutoReload` is the caller's "no seat, no game snapshot" verdict; the tab
 * must also be visible, and a hidden tab reloads when it next becomes visible.
 */
export const markClientStale = (messageType: string | null, canAutoReload: () => boolean): void => {
  if (typeof window === "undefined") return;
  if (!stale) {
    stale = true;
    // Beacon: the reload below may follow immediately, before a batched send.
    // The engine echoes the version it was sent, so ours is this bundle's.
    try {
      track(
        "client_version_stale",
        { client_version: PROTOCOL_VERSION, message_type: messageType ?? undefined },
        { beacon: true },
      );
    } catch {
      /* analytics must never break the caller */
    }
    listeners.forEach((fn) => fn());
  }
  const tryReload = () => {
    if (document.visibilityState !== "visible") return false;
    if (canAutoReload()) reloadIfGuardAllows();
    return true;
  };
  if (tryReload()) return;
  const onVisible = () => {
    if (tryReload()) document.removeEventListener("visibilitychange", onVisible);
  };
  document.addEventListener("visibilitychange", onVisible);
};

/** Tests only: a fresh page. */
export const resetClientStale = (): void => {
  stale = false;
  listeners.forEach((fn) => fn());
};
