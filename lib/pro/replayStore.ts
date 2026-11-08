/**
 * Local persistence for saved Pro replays (#122). One small adapter over
 * localStorage so a later IndexedDB swap is a single-file change: the page only
 * ever calls saveReplay/listReplays/loadReplay/deleteReplay/toggleStar and reads
 * a StorageMeter — never localStorage directly.
 *
 * Layout: an index (id → metadata, for the list without parsing every bundle)
 * under `INDEX_KEY`, and each bundle under `REPLAY_PREFIX + id`. Splitting them
 * keeps the list render cheap and lets eviction drop a bundle body while the
 * meter stays exact (it sums real serialized bytes).
 *
 * Retention (evaluated lazily once per page load — a static client has no
 * background timer; see purgeExpiredOnLoad):
 *  - starred replays are pinned (never auto-deleted, never evicted),
 *  - unstarred replays auto-delete after RETENTION_DAYS,
 *  - near the byte cap, saveReplay evicts oldest UNSTARRED first to make room.
 */
import type { ReplayBundle } from "./protocol";
import { stripFrames } from "./replayFrames";
import { replayHeroList } from "./replayHeroes";

const INDEX_KEY = "unbrewed:pro:replays:index";
const REPLAY_PREFIX = "unbrewed:pro:replay:";

/**
 * Replays' share of the origin's localStorage (#1551). Browsers cap the WHOLE
 * origin at ~5 M characters (Chrome/Firefox: 5 MiB of key+value UTF-16 code
 * units; Safari about the same). Replay JSON is ASCII, so the UTF-8 byte count
 * here equals the character count the quota charges. A 5 MiB budget therefore
 * let replays alone fill the origin, leaving no room for the bag (DECKS +
 * MAP_LIST), the refresh-resume blob, flags and prefs — and every later write,
 * including the next replay, threw QuotaExceeded. Half the quota keeps the
 * other ~2.5 MiB for everything else (a full bag of image-URL decks is a few
 * hundred KB) while still holding dozens of frame-stripped replays.
 */
export const STORAGE_BUDGET_BYTES = 2.5 * 1024 * 1024;
export const STORAGE_WARN_RATIO = 0.8;
export const RETENTION_DAYS = 7;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

export interface ReplayIndexEntry {
  id: string;
  savedAt: number; // epoch ms this browser saved it
  starred: boolean;
  bytes: number; // serialized size of the stored bundle
  // denormalized from bundle.meta for the list UI
  winner: ReplayBundle["meta"]["winner"];
  heroes: string[];
  turns: number;
  endedAt: number;
  mapTitle: string;
}

export interface StorageMeter {
  usedBytes: number;
  budgetBytes: number;
  ratio: number; // 0..1 (clamped)
  nearFull: boolean; // ratio >= STORAGE_WARN_RATIO
}

const hasWindow = () => typeof window !== "undefined";
const byteLength = (s: string) =>
  typeof TextEncoder !== "undefined" ? new TextEncoder().encode(s).length : s.length;

// ---- index read/write -------------------------------------------------------

function readIndex(): ReplayIndexEntry[] {
  if (!hasWindow()) return [];
  try {
    const raw = window.localStorage.getItem(INDEX_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as ReplayIndexEntry[]) : [];
  } catch {
    return [];
  }
}

function writeIndex(entries: ReplayIndexEntry[]): void {
  if (!hasWindow()) return;
  window.localStorage.setItem(INDEX_KEY, JSON.stringify(entries));
}

// ---- stable id from bundle contents -----------------------------------------

/**
 * Deterministic id from the match's identity (heroes + seed + action count + end
 * time), so re-importing the SAME bundle updates in place instead of duplicating.
 * FNV-1a hex — dependency-free and stable.
 */
export function replayId(bundle: ReplayBundle): string {
  const key = [
    replayHeroList(bundle.meta.heroes).join("v"),
    bundle.config.seed,
    bundle.actionLog.length,
    bundle.meta.endedAt,
    bundle.meta.winner ?? "?",
  ].join("|");
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `r${h.toString(16).padStart(8, "0")}`;
}

// ---- retention --------------------------------------------------------------

/**
 * Drop unstarred replays older than RETENTION_DAYS. Call on page load. Returns the
 * ids purged so the caller can report "N old replays cleaned up". Starred survive.
 */
export function purgeExpired(now: number = Date.now()): string[] {
  if (!hasWindow()) return [];
  const entries = readIndex();
  const cutoff = now - RETENTION_MS;
  const purged: string[] = [];
  const kept = entries.filter((e) => {
    if (!e.starred && e.savedAt < cutoff) {
      window.localStorage.removeItem(REPLAY_PREFIX + e.id);
      purged.push(e.id);
      return false;
    }
    return true;
  });
  if (purged.length) writeIndex(kept);
  return purged;
}

// Load-time sweep (#1551): run once per page load app-wide (pages/_app.tsx), so
// players who never open the Replays page still get the 7-day cleanup. What it
// purged is held until the Replays page reports it.
let loadSweepDone = false;
let unreportedPurges: string[] = [];

/** Run purgeExpired at most once per page load. Never throws. */
export function purgeExpiredOnLoad(now: number = Date.now()): void {
  if (loadSweepDone) return;
  loadSweepDone = true;
  try {
    unreportedPurges.push(...purgeExpired(now));
  } catch {
    // Storage blocked (privacy mode, sandboxed iframe) — nothing to clean.
  }
}

/**
 * For the Replays page: make sure the load sweep ran, sweep again (a long-lived
 * tab can cross a cutoff), and return every purged id not yet reported — so its
 * "N old replays cleaned up" message still fires after the app-wide sweep.
 */
export function takePurgedReplays(now: number = Date.now()): string[] {
  purgeExpiredOnLoad(now);
  const purged = [...unreportedPurges, ...purgeExpired(now)];
  unreportedPurges = [];
  return purged;
}

/** Test-only: forget that this "page load" already swept. */
export function resetLoadSweepForTests(): void {
  loadSweepDone = false;
  unreportedPurges = [];
}

// ---- meter ------------------------------------------------------------------

export function storageMeter(): StorageMeter {
  const used = readIndex().reduce((sum, e) => sum + e.bytes, 0);
  const ratio = Math.min(1, used / STORAGE_BUDGET_BYTES);
  return {
    usedBytes: used,
    budgetBytes: STORAGE_BUDGET_BYTES,
    ratio,
    nearFull: ratio >= STORAGE_WARN_RATIO,
  };
}

// ---- list / load / save / delete / star -------------------------------------

/** Newest-first, starred sorted above unstarred (pinned to the top). */
export function listReplays(): ReplayIndexEntry[] {
  return readIndex().sort((a, b) => Number(b.starred) - Number(a.starred) || b.savedAt - a.savedAt);
}

export function loadReplay(id: string): ReplayBundle | null {
  if (!hasWindow()) return null;
  try {
    const raw = window.localStorage.getItem(REPLAY_PREFIX + id);
    return raw ? (JSON.parse(raw) as ReplayBundle) : null;
  } catch {
    return null;
  }
}

export interface SaveResult {
  ok: boolean;
  id: string;
  evicted: string[]; // ids removed to make room
  error?: string; // set when even after eviction it wouldn't fit
}

/** The replay this page load saved last — the game that just ended. Spared by
 *  evictOldestUnstarred (#1550). */
let savedThisSession: string | null = null;

/**
 * Persist a bundle. Idempotent by content (see replayId): saving the same match
 * again refreshes it in place (keeping its star). Evicts oldest UNSTARRED replays
 * if needed to stay under the byte budget; never evicts a starred replay.
 */
export function saveReplay(
  input: ReplayBundle,
  now: number = Date.now(),
  budgetBytes: number = STORAGE_BUDGET_BYTES,
): SaveResult {
  if (!hasWindow()) return { ok: false, id: "", evicted: [], error: "no storage" };
  // A bundle read back from a share link carries the expansion frozen in at
  // upload time (#701) — hundreds of KB against a 2.5 MiB budget, and pointless
  // locally, where the live engine can always re-expand the action log. Strip it
  // here so no path into localStorage can smuggle frames in.
  const bundle = stripFrames(input);
  const id = replayId(bundle);
  const serialized = JSON.stringify(bundle);
  const bytes = byteLength(serialized);

  let entries = readIndex();
  const existing = entries.find((e) => e.id === id);

  // Free space: sum of everything except this id, evicting oldest unstarred until
  // it fits. (A single bundle larger than the whole budget can't be saved.)
  const others = entries.filter((e) => e.id !== id);
  const evicted: string[] = [];
  let othersBytes = others.reduce((s, e) => s + e.bytes, 0);
  const evictable = others
    .filter((e) => !e.starred)
    .sort((a, b) => a.savedAt - b.savedAt); // oldest first
  let ei = 0;
  while (othersBytes + bytes > budgetBytes && ei < evictable.length) {
    const victim = evictable[ei++];
    window.localStorage.removeItem(REPLAY_PREFIX + victim.id);
    othersBytes -= victim.bytes;
    evicted.push(victim.id);
  }
  if (othersBytes + bytes > budgetBytes) {
    return { ok: false, id, evicted, error: "not enough space (only starred replays remain)" };
  }

  try {
    window.localStorage.setItem(REPLAY_PREFIX + id, serialized);
  } catch (e) {
    return { ok: false, id, evicted, error: e instanceof Error ? e.message : "write failed" };
  }

  const entry: ReplayIndexEntry = {
    id,
    savedAt: existing?.savedAt ?? now,
    starred: existing?.starred ?? false,
    bytes,
    winner: bundle.meta.winner,
    heroes: replayHeroList(bundle.meta.heroes),
    turns: bundle.meta.turns,
    endedAt: bundle.meta.endedAt,
    mapTitle: bundle.meta.mapTitle,
  };
  entries = [...others.filter((e) => !evicted.includes(e.id)), entry];
  writeIndex(entries);
  savedThisSession = id;
  return { ok: true, id, evicted };
}

/**
 * Free at least `bytes` by deleting the oldest UNSTARRED replays (starred are
 * never touched, nor the replay this page load just saved). For callers outside
 * this store whose own write hit the origin quota (#1550). Deletes nothing when
 * all of them together are smaller than `bytes` — the write could not land
 * anyway. Returns the ids removed.
 */
export function evictOldestUnstarred(bytes: number): string[] {
  if (!hasWindow()) return [];
  const entries = readIndex();
  const victims = entries
    .filter((e) => !e.starred && e.id !== savedThisSession)
    .sort((a, b) => a.savedAt - b.savedAt);
  if (victims.reduce((sum, e) => sum + e.bytes, 0) < bytes) return [];
  const evicted: string[] = [];
  let freed = 0;
  for (const v of victims) {
    if (freed >= bytes) break;
    window.localStorage.removeItem(REPLAY_PREFIX + v.id);
    freed += v.bytes;
    evicted.push(v.id);
  }
  if (evicted.length) {
    try {
      writeIndex(entries.filter((e) => !evicted.includes(e.id)));
    } catch {
      // the index only shrank; a failed rewrite leaves dangling entries loadReplay already tolerates
    }
  }
  return evicted;
}

export function deleteReplay(id: string): void {
  if (!hasWindow()) return;
  window.localStorage.removeItem(REPLAY_PREFIX + id);
  writeIndex(readIndex().filter((e) => e.id !== id));
}

/** Toggle (or set) the star. Returns the new starred state. */
export function toggleStar(id: string, value?: boolean): boolean {
  const entries = readIndex();
  const entry = entries.find((e) => e.id === id);
  if (!entry) return false;
  entry.starred = value ?? !entry.starred;
  writeIndex(entries);
  return entry.starred;
}
