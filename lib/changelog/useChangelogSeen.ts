/**
 * "Seen" state for the changelog (unbrewed-p2p-982) — modelled on the
 * per-browser localStorage flags in `components/Navbar/ProNavButton.tsx`
 * (namespaced key, try-guarded) and the shared module store in `lib/flags.ts`
 * (`useSyncExternalStore`, so `markAllSeen()` in one place clears the pill
 * everywhere on the page).
 *
 * `unseen` reads `false`-equivalent (empty) until after mount — the store is
 * only ever seeded on the client, so the first (SSR) render always matches
 * across server and client and there's no hydration mismatch.
 *
 * Branches (see the ticket for the full rationale):
 *  - key absent, localStorage otherwise empty  -> brand-new visitor: the
 *    newest id is written silently, unseen is empty.
 *  - key absent, some other key present        -> returning player meeting
 *    the feature for the first time: unseen = entries from the last 30 days.
 *  - key present                               -> unseen = entries whose id
 *    sorts after the stored id (newer than what was last acknowledged).
 *  - localStorage unavailable/throwing         -> unseen is empty, no crash.
 */
import { useCallback, useSyncExternalStore } from "react";

import { getChangelogEntries } from "./entries";
import type { ChangelogEntry } from "./types";

export const CHANGELOG_SEEN_KEY = "unbrewed:changelog-last-seen";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const EMPTY: ChangelogEntry[] = [];

const readLastSeen = (): string | null | undefined => {
  try {
    return window.localStorage.getItem(CHANGELOG_SEEN_KEY);
  } catch {
    // localStorage unavailable entirely (private mode / storage disabled) —
    // `undefined` distinguishes this from a confirmed-absent key.
    return undefined;
  }
};

const hasAnyOtherStorageActivity = (): boolean => {
  try {
    return window.localStorage.length > 0;
  } catch {
    return false;
  }
};

const writeLastSeen = (id: string): void => {
  try {
    window.localStorage.setItem(CHANGELOG_SEEN_KEY, id);
  } catch {
    /* private mode / storage disabled — just doesn't persist */
  }
};

const isWithinLast30Days = (dateStr: string): boolean =>
  Date.now() - new Date(dateStr).getTime() <= THIRTY_DAYS_MS;

const computeUnseen = (): ChangelogEntry[] => {
  const entries = getChangelogEntries(); // newest first
  if (entries.length === 0) return EMPTY;

  const lastSeen = readLastSeen();
  if (lastSeen === undefined) return EMPTY; // storage unavailable/throwing

  if (lastSeen === null) {
    if (!hasAnyOtherStorageActivity()) {
      // Brand-new visitor: silently ack the newest entry, nothing to show.
      writeLastSeen(entries[0].id);
      return EMPTY;
    }
    // Returning player meeting the feature for the first time.
    const withinWindow = entries.filter((e) => isWithinLast30Days(e.date));
    return withinWindow.length > 0 ? withinWindow : EMPTY;
  }

  const unseen = entries.filter((e) => e.id > lastSeen);
  return unseen.length > 0 ? unseen : EMPTY;
};

// --- shared module store, mirroring lib/flags.ts ----------------------------

const listeners = new Set<() => void>();
let store: ChangelogEntry[] | null = null;

const ensureStore = (): ChangelogEntry[] => {
  if (store === null) {
    store = computeUnseen();
  }
  return store;
};

const notify = () => listeners.forEach((l) => l());

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = (): ChangelogEntry[] =>
  typeof window === "undefined" ? EMPTY : ensureStore();

const serverSnapshot = (): ChangelogEntry[] => EMPTY;

/** Writes the newest entry's id as seen and clears `unseen` everywhere. */
export const markAllChangelogSeen = (): void => {
  const entries = getChangelogEntries();
  if (entries.length === 0) return;
  writeLastSeen(entries[0].id);
  store = EMPTY;
  notify();
};

export const useChangelogSeen = (): {
  unseen: ChangelogEntry[];
  markAllSeen: () => void;
} => {
  const unseen = useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
  const markAllSeen = useCallback(markAllChangelogSeen, []);
  return { unseen, markAllSeen };
};

/** Test-only: drop the memoized store so the next read re-seeds from storage. */
export const __resetChangelogSeenForTest = () => {
  store = null;
};
