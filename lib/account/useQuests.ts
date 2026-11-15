/**
 * Quests + day-streak state (issue #1658).
 *
 * A module-level store, the `useBadges` choice and for the same reason: there
 * are consumers on several surfaces at once. The quests panel reads the board
 * AND the streak; the navbar's account button reads only the streak. Sharing
 * one probe each means one `GET /me/quests` and one `GET /me/stats` however
 * many of them are mounted.
 *
 * Two independent probes, because they answer different consumers:
 *
 *  - **quests** (`/me/quests`) is asked only by the panel;
 *  - **daily** (the `daily` block of `/me/stats`) is asked by the panel and by
 *    the streak chip, so a page with just the navbar never fetches quests.
 *
 * The standing account rules hold:
 *
 * 1. **A guest costs nothing.** Neither probe fires until the account state
 *    says "signed-in".
 * 2. **No retry, no loud failure.** A 404/503/unreachable API is a quiet
 *    `unavailable`, and the UI renders nothing.
 *
 * One difference from the badge case: this data moves every time the player
 * finishes a game, and the panel lives on the page they come BACK to. So a
 * consumer mounting on data older than {@link STALE_MS} re-asks — keeping what
 * is on screen meanwhile, and leaving it alone if the refresh fails.
 */
import { useEffect, useState } from "react";

import type { DailyStats } from "./bonuses";
import { type QuestBoard, fetchQuests } from "./quests";
import { fetchAccountStats } from "./stats";
import { useAccount } from "./useAccount";

/**
 * - `loading`     — the account probe or the quests request is in flight
 * - `guest`       — nobody signed in; nothing was requested
 * - `unavailable` — signed in, but no board came back → render nothing
 * - `ready`       — a board in hand (possibly an empty one)
 */
export type QuestsStatus = "loading" | "guest" | "unavailable" | "ready";

export interface QuestsState {
  status: QuestsStatus;
  board: QuestBoard | null;
  /** The streak block, or null while unknown / when the API doesn't send it. */
  daily: DailyStats | null;
}

/** A mount on data older than this re-asks (the API caches stats for 60s). */
export const STALE_MS = 60_000;

interface Store {
  quests: { status: QuestsStatus; board: QuestBoard | null };
  daily: DailyStats | null;
}

const EMPTY: Store = { quests: { status: "loading", board: null }, daily: null };
const GUEST: Store = { quests: { status: "guest", board: null }, daily: null };

let store: Store = EMPTY;
const listeners = new Set<(next: Store) => void>();

/** In-flight (or settled) probes, with when they were fired. */
let questsProbe: { promise: Promise<void>; at: number } | null = null;
let dailyProbe: { promise: Promise<void>; at: number } | null = null;
/** Bumped on reset, so an answer for the previous account is dropped. */
let generation = 0;

const publish = (next: Store) => {
  store = next;
  listeners.forEach((listener) => listener(next));
};

const fresh = (probe: { at: number } | null): boolean =>
  !!probe && Date.now() - probe.at < STALE_MS;

/** Ask `/me/quests`, unless a recent probe already did. */
export const ensureQuestsProbe = (): Promise<void> => {
  if (questsProbe && fresh(questsProbe)) return questsProbe.promise;
  const mine = generation;
  const promise = fetchQuests().then((result) => {
    if (mine !== generation) return;
    if (result.ok) {
      publish({ ...store, quests: { status: "ready", board: result.value } });
      return;
    }
    // A failed REFRESH must not blank a board the player can already see.
    if (store.quests.status === "ready") return;
    publish({ ...store, quests: { status: "unavailable", board: null } });
  });
  questsProbe = { promise, at: Date.now() };
  return promise;
};

/** Ask `/me/stats` for the daily block, unless a recent probe already did. */
export const ensureDailyProbe = (): Promise<void> => {
  if (dailyProbe && fresh(dailyProbe)) return dailyProbe.promise;
  const mine = generation;
  const promise = fetchAccountStats().then((result) => {
    if (mine !== generation) return;
    // A failed refresh keeps the streak on screen; a successful one is the
    // truth even when it says "no daily block".
    if (!result.ok) return;
    publish({ ...store, daily: result.value.daily ?? null });
  });
  dailyProbe = { promise, at: Date.now() };
  return promise;
};

/** Drop everything and allow fresh probes — used when the account changes. */
const reset = (next: Store) => {
  generation += 1;
  questsProbe = null;
  dailyProbe = null;
  publish(next);
};

/**
 * Subscribe to the store, driving `ask` off the account state.
 *
 * Starts at EMPTY on every mount so the server render and the first client
 * paint agree, then syncs — the `useAccount` / `useBadges` idiom.
 */
const useStore = (ask: () => void): { store: Store; accountLoading: boolean } => {
  const { status: accountStatus } = useAccount();
  const [snapshot, setSnapshot] = useState<Store>(EMPTY);

  useEffect(() => {
    let alive = true;
    const listener = (next: Store) => {
      if (alive) setSnapshot(next);
    };
    listeners.add(listener);
    if (store !== EMPTY) setSnapshot(store);
    return () => {
      alive = false;
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (accountStatus === "signed-in") {
      ask();
      return;
    }
    if (accountStatus === "loading") return;
    // Signed out, or an accounts API we never reached: forget the previous
    // account's quests and arm fresh probes for a later sign-in.
    if (store !== GUEST) reset(GUEST);
    // `ask` is a module-level function at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountStatus]);

  return { store: snapshot, accountLoading: accountStatus === "loading" };
};

const askBoth = () => {
  void ensureQuestsProbe();
  void ensureDailyProbe();
};

const askDaily = () => {
  void ensureDailyProbe();
};

const LOADING: QuestsState = { status: "loading", board: null, daily: null };

/** The quests panel's view: the board plus the streak block. */
export const useQuests = (): QuestsState => {
  const { store: snapshot, accountLoading } = useStore(askBoth);
  if (accountLoading) return LOADING;
  return { ...snapshot.quests, daily: snapshot.daily };
};

/**
 * Just the streak block, for the account button's chip. Fires only the stats
 * probe — a page with nothing but the navbar never asks for quests.
 */
export const useDailyBonus = (): DailyStats | null => {
  const { store: snapshot, accountLoading } = useStore(askDaily);
  return accountLoading ? null : snapshot.daily;
};

/** Test-only: drop the shared store so each case starts from cold probes. */
export const __resetQuestsStoreForTests = () => {
  generation += 1;
  store = EMPTY;
  questsProbe = null;
  dailyProbe = null;
  listeners.clear();
};
