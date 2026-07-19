/**
 * Client-only feature flags for opt-in experiments.
 *
 * Flags default ON for THIS browser and stay on unless explicitly toggled off
 * in the beta-features menu (which persists `"off"` to localStorage). A URL
 * param (`?zoomMap`) is a sticky opt-in that writes `"on"` to storage so it
 * survives dropping the param — but it never overrides an explicit `"off"`.
 * Values are computed only after mount, so `useFlag` returns `false` on the
 * first (SSR) render — no hydration mismatch, and an off flag renders literally
 * nothing when consumers gate on it (`{flag && <Feature/>}`).
 *
 * State lives in a single module store shared by every `useFlag`/`useFlags`
 * caller, so toggling a flag in the beta-features menu updates its consumer
 * live (no reload) as well as the menu chip's dim state.
 *
 * ── Adding a flag ──────────────────────────────────────────────────────────
 *   1. Add an entry to FLAGS below (the key is the URL param + storage suffix).
 *   2. Gate the feature: `const [on] = useFlag("myFlag"); return on && <X/>;`
 * It shows up in the beta-features menu automatically.
 *
 * ── Removing / graduating a flag (single greppable delete) ─────────────────
 *   1. Delete its FLAGS entry here.
 *   2. Delete the `{flag && …}` guard(s) at its consumer(s) (grep the key).
 *   3. Optionally have users clear the stale `"flag-<name>"` localStorage key —
 *      it is inert once the entry is gone.
 * No other traces exist: the registry is the single source of truth.
 */
import { useCallback, useSyncExternalStore } from "react";

/** The experiment registry — one entry per flag, discoverable in the menu. */
export const FLAGS = {
  zoomMap: {
    label: "Full-screen board",
    desc: "The board fills the screen and can be dragged and pinch-zoomed. Off = the old boxed board.",
  },
  replays: {
    label: "Match replays",
    desc: "Save finished Pro games and scrub through them in full God-view.",
  },
  tokenLife: {
    label: "Lively tokens",
    desc: "Board tokens react to combat (recoil, lunge, brace, topple) and breathe at rest.",
  },
} as const;

export type FlagName = keyof typeof FLAGS;

const FLAG_NAMES = Object.keys(FLAGS) as FlagName[];

/** dash-prefixed to match the `"pro-sound-fx"` convention (recentRooms/useGameFx). */
const storageKey = (name: FlagName) => `flag-${name}`;

const urlHasParam = (name: FlagName): boolean => {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).has(name);
  } catch {
    return false;
  }
};

// --- shared module store ----------------------------------------------------
// One boolean per flag, lazily seeded from URL + localStorage on the client.
// SSR reads an all-false snapshot (see getServerSnapshot) so the first render
// matches the server; the real values arrive on the post-mount subscribe.

const listeners = new Set<() => void>();
let store: Record<FlagName, boolean> | null = null;
// Cached tuple list, rebuilt only when `store` changes, so useSyncExternalStore
// gets a referentially-stable snapshot (no render loop).
let listSnapshot: FlagState[] | null = null;

const seed = (name: FlagName): boolean => {
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(storageKey(name));
  } catch {
    /* storage blocked — fall back to default-on */
  }
  if (urlHasParam(name)) {
    // `?zoomMap` is a sticky opt-in, but must never resurrect an explicit "off".
    if (stored !== "off") {
      try {
        window.localStorage.setItem(storageKey(name), "on");
      } catch {
        /* ignore */
      }
      return true;
    }
    return false;
  }
  // Default ON: only an explicit "off" opts out. Never-touched (null) and "on"
  // both read on.
  return stored !== "off";
};

const ensureStore = (): Record<FlagName, boolean> => {
  if (!store) {
    store = Object.fromEntries(FLAG_NAMES.map((n) => [n, seed(n)])) as Record<
      FlagName,
      boolean
    >;
  }
  return store;
};

const setFlag = (name: FlagName, on: boolean) => {
  const cur = ensureStore();
  if (cur[name] === on) return;
  store = { ...cur, [name]: on };
  listSnapshot = null; // invalidate cache
  try {
    window.localStorage.setItem(storageKey(name), on ? "on" : "off");
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const getSnapshot = (name: FlagName) => (): boolean =>
  typeof window === "undefined" ? false : ensureStore()[name];

/** SSR-safe default OFF — keeps first client render identical to the server. */
const serverSnapshot = () => false;

/**
 * `[on, toggle]` for one flag. `false` until mount, then the URL + localStorage
 * value; toggling flips it for every subscriber and persists to localStorage.
 */
export const useFlag = (name: FlagName): [boolean, () => void] => {
  const on = useSyncExternalStore(subscribe, getSnapshot(name), serverSnapshot);
  const toggle = useCallback(() => setFlag(name, !ensureStore()[name]), [name]);
  return [on, toggle];
};

export type FlagState = { name: FlagName; on: boolean; toggle: () => void };

// Every flag off — a single frozen reference reused for every SSR render.
const serverList: FlagState[] = FLAG_NAMES.map((name) => ({
  name,
  on: false,
  toggle: () => setFlag(name, true),
}));

const getListSnapshot = (): FlagState[] => {
  if (typeof window === "undefined") return serverList;
  if (!listSnapshot) {
    const cur = ensureStore();
    listSnapshot = FLAG_NAMES.map((name) => ({
      name,
      on: cur[name],
      toggle: () => setFlag(name, !ensureStore()[name]),
    }));
  }
  return listSnapshot;
};

/** Every registered flag with its live state — for the beta-features menu. */
export const useFlags = (): FlagState[] =>
  useSyncExternalStore(subscribe, getListSnapshot, () => serverList);
