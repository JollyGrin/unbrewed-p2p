/**
 * Where the origin's localStorage actually went (#645).
 *
 * The bag meter used to sum EVERY key against a 5 MB budget, so a pile of Pro
 * replays (lib/pro/replayStore.ts — its own 5 MB budget and its own eviction)
 * made the bag read "6948.95kb / 5120kb" while holding three decks. The bag
 * only owns DECKS + MAP_LIST; everything else is reported, not charged.
 *
 * The calc is pure over key/value pairs so the meter, the tests, and a later
 * account-first bag (#644) can all share it.
 */
import { useEffect, useState } from "react";

import { LS_KEY } from "@/lib/hooks/useLocalStorage";

/** Every replay key (index + bundles) starts with this — see replayStore.ts. */
export const REPLAY_KEY_PREFIX = "unbrewed:pro:replay";

/** What the bag itself is charged against, in bytes. localStorage is ~5 MB. */
export const BAG_BUDGET_BYTES = 5 * 1024 * 1024;

export interface StorageBreakdown {
  /** LS_KEY.DECKS */
  deckBytes: number;
  /** LS_KEY.MAP_LIST */
  mapBytes: number;
  /** Pro replays — the index and every saved bundle. */
  replayBytes: number;
  /** Anything else on the origin (servers, flags, prefs, third parties). */
  otherBytes: number;
  /** deckBytes + mapBytes — the only part the bag meter charges for. */
  bagBytes: number;
  /** Everything, for context. */
  totalBytes: number;
}

export const EMPTY_BREAKDOWN: StorageBreakdown = {
  deckBytes: 0,
  mapBytes: 0,
  replayBytes: 0,
  otherBytes: 0,
  bagBytes: 0,
  totalBytes: 0,
};

/**
 * Bytes one entry occupies. localStorage stores UTF-16, and the key counts too
 * — the same estimate the old meter used, kept so numbers stay comparable.
 */
export const entryBytes = (key: string, value: string): number =>
  (key.length + value.length) * 2;

/** Pure calc: hand it the origin's entries, get the split. */
export function computeStorageBreakdown(
  entries: Iterable<readonly [string, string]>,
): StorageBreakdown {
  const out = { ...EMPTY_BREAKDOWN };
  for (const [key, value] of entries) {
    const bytes = entryBytes(key, value ?? "");
    out.totalBytes += bytes;
    if (key === LS_KEY.DECKS) out.deckBytes += bytes;
    else if (key === LS_KEY.MAP_LIST) out.mapBytes += bytes;
    else if (key.startsWith(REPLAY_KEY_PREFIX)) out.replayBytes += bytes;
    else out.otherBytes += bytes;
  }
  out.bagBytes = out.deckBytes + out.mapBytes;
  return out;
}

/** Snapshot of this browser's localStorage; all zeroes when there's no window. */
export function readStorageBreakdown(): StorageBreakdown {
  if (typeof window === "undefined") return { ...EMPTY_BREAKDOWN };
  const entries: [string, string][] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key === null) continue;
      entries.push([key, window.localStorage.getItem(key) ?? ""]);
    }
  } catch {
    return { ...EMPTY_BREAKDOWN };
  }
  return computeStorageBreakdown(entries);
}

/** Bytes → kilobytes, rounded to 2dp like the old meter. */
export const bytesToKb = (bytes: number): number => +(bytes / 1024).toFixed(2);

/** Compact kb label for the meter line: "0", "<1", "12", "5940". */
export function formatKb(bytes: number): string {
  const kb = bytes / 1024;
  if (kb === 0) return "0";
  if (kb < 1) return "<1";
  return String(Math.round(kb));
}

/**
 * Same-tab "localStorage changed" ping — the native `storage` event only fires
 * in OTHER tabs, so writes here would leave the meter stale until a reload.
 */
const STORAGE_CHANGED_EVENT = "unbrewed:storage-changed";

export function notifyStorageChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(STORAGE_CHANGED_EVENT));
}

/** Live breakdown for this browser. Zeroes on the first (SSR) render. */
export function useStorageBreakdown(): StorageBreakdown {
  const [breakdown, setBreakdown] = useState<StorageBreakdown>(EMPTY_BREAKDOWN);

  useEffect(() => {
    const read = () => setBreakdown(readStorageBreakdown());
    read();
    window.addEventListener(STORAGE_CHANGED_EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(STORAGE_CHANGED_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);

  return breakdown;
}
