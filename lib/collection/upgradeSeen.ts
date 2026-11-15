/**
 * "There is an upgrade you have not looked at" — the Collection nav dot's
 * state (p2p #1657). Modelled on `lib/changelog/useChangelogSeen.ts`: one
 * try-guarded localStorage key behind a module store, read through
 * `useSyncExternalStore` so every chip on the page moves together and the
 * first (SSR) render is always "no dot".
 *
 * Two maps, heroId → tier:
 *
 *  - `affordable` — the best card tier that hero's points afford, as last
 *    reported by a surface that actually knew: the post-game strip adds the
 *    hero just played, /collection corrects the ones already listed.
 *  - `seen` — the tier that was affordable the last time the player had that
 *    hero open on /collection.
 *
 * The dot is on while any hero's affordable tier is above its seen one. So a
 * visit clears it, buying the upgrade keeps it clear, and it comes back only
 * when something NEW comes into reach (a higher tier, or the same one again
 * after the points were spent — a hero that stops being affordable forgets
 * its `seen`).
 *
 * The nav never fetches for this: it reads what other surfaces wrote. A chip
 * on every page asking `/me/cosmetics` to decide on a dot would be the wrong
 * trade.
 */
import { useSyncExternalStore } from "react";

export const UPGRADES_SEEN_KEY = "unbrewed:collection-upgrades";

export interface UpgradeSeenState {
  affordable: Record<string, number>;
  seen: Record<string, number>;
}

const EMPTY: UpgradeSeenState = { affordable: {}, seen: {} };

const asTierMap = (raw: unknown): Record<string, number> => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [heroId, tier] of Object.entries(raw)) {
    if (heroId && typeof tier === "number" && Number.isFinite(tier) && tier > 0) out[heroId] = Math.round(tier);
  }
  return out;
};

/** Stored JSON → state; anything unreadable is the empty state. */
export const parseUpgradeSeen = (raw: string | null): UpgradeSeenState => {
  if (!raw) return EMPTY;
  try {
    const root = JSON.parse(raw) as { affordable?: unknown; seen?: unknown } | null;
    return { affordable: asTierMap(root?.affordable), seen: asTierMap(root?.seen) };
  } catch {
    return EMPTY;
  }
};

// --- the pure transitions ------------------------------------------------------

/** Is any hero's affordable tier above the one the player last looked at? */
export const hasUnseenUpgrade = (state: UpgradeSeenState): boolean =>
  Object.entries(state.affordable).some(([heroId, tier]) => tier > (state.seen[heroId] ?? 0));

/** Drop `seen` for heroes with nothing affordable, so a later upgrade is news again. */
const prune = (affordable: Record<string, number>, seen: Record<string, number>): UpgradeSeenState => ({
  affordable,
  seen: Object.fromEntries(Object.entries(seen).filter(([heroId]) => heroId in affordable)),
});

/** One hero's affordable tier changed (0 = nothing affordable any more). */
export const withAffordable = (state: UpgradeSeenState, heroId: string, tier: number): UpgradeSeenState => {
  const affordable = { ...state.affordable };
  if (tier > 0) affordable[heroId] = tier;
  else delete affordable[heroId];
  return prune(affordable, state.seen);
};

/**
 * A surface that knows every hero's balance (/collection) corrects the heroes
 * already on the list: a tier that moved is updated, an upgrade that was bought
 * or is no longer affordable is dropped. It never ADDS a hero — a long-time
 * player opening /collection would otherwise be handed a dot per hero and have
 * to click through all of them to be rid of it. New entries come from a game.
 */
export const withRefreshed = (state: UpgradeSeenState, tiers: Record<string, number>): UpgradeSeenState => {
  const known = asTierMap(tiers);
  const affordable: Record<string, number> = {};
  for (const heroId of Object.keys(state.affordable)) {
    if (known[heroId]) affordable[heroId] = known[heroId];
  }
  return prune(affordable, state.seen);
};

/** The player has this hero open on /collection. */
export const withSeen = (state: UpgradeSeenState, heroId: string): UpgradeSeenState => {
  const tier = state.affordable[heroId];
  if (!tier || state.seen[heroId] === tier) return state;
  return { ...state, seen: { ...state.seen, [heroId]: tier } };
};

// --- the store -----------------------------------------------------------------

const listeners = new Set<() => void>();
let store: UpgradeSeenState | null = null;

const read = (): UpgradeSeenState => {
  try {
    return parseUpgradeSeen(window.localStorage.getItem(UPGRADES_SEEN_KEY));
  } catch {
    return EMPTY; // storage unavailable: no dot, no crash
  }
};

const current = (): UpgradeSeenState => (store ??= read());

const same = (a: Record<string, number>, b: Record<string, number>): boolean => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
};

const commit = (next: UpgradeSeenState): void => {
  const prev = current();
  if (same(prev.affordable, next.affordable) && same(prev.seen, next.seen)) return;
  store = next;
  try {
    window.localStorage.setItem(UPGRADES_SEEN_KEY, JSON.stringify(next));
  } catch {
    /* private mode / storage disabled — the dot just doesn't persist */
  }
  listeners.forEach((listener) => listener());
};

// Another tab wrote (the /collection tab the post-game button opened): re-read,
// so the dot on the game tab clears without a reload.
const onStorage = (event: StorageEvent) => {
  if (event.key !== null && event.key !== UPGRADES_SEEN_KEY) return;
  store = null;
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  if (listeners.size === 0) window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
};

const isBrowser = () => typeof window !== "undefined";

export const noteAffordableUpgrade = (heroId: string, tier: number): void => {
  if (isBrowser() && heroId) commit(withAffordable(current(), heroId, tier));
};

export const refreshAffordableUpgrades = (tiers: Record<string, number>): void => {
  if (isBrowser()) commit(withRefreshed(current(), tiers));
};

export const markUpgradeSeen = (heroId: string): void => {
  if (isBrowser() && heroId) commit(withSeen(current(), heroId));
};

const getSnapshot = (): boolean => hasUnseenUpgrade(current());
const serverSnapshot = (): boolean => false;

/** True while some hero has an affordable upgrade the player has not seen. */
export const useUnseenUpgrade = (): boolean => useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);

/** Test-only: drop the memoized store so the next read re-seeds from storage. */
export const __resetUpgradeSeenForTest = () => {
  store = null;
};
