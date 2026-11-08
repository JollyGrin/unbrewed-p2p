/**
 * Client-only reconnect bookkeeping for Pro rooms (no server involvement).
 *
 * Reconnect tokens used to live in sessionStorage, which dies with the tab —
 * a host who refreshed a tab whose URL never carried `?room=` lost the seat
 * with no way back. Tokens now live in localStorage alongside a small
 * recent-rooms index so the lobby can offer "resume" for matches this
 * browser was seated in. Rooms are in-memory on the server, so entries go
 * stale on server restart — the index is pruned by age and on
 * ROOM_NOT_FOUND, and resuming a dead room degrades to the normal error
 * screen (which also forgets it).
 */

import { captureException } from "../analytics";
import type { RoomBots } from "./rematch";
import { evictOldestUnstarred } from "./replayStore";

export interface RecentRoom {
  roomId: string;
  ts: number; // last time this browser was seated (ms epoch)
}

const TOKEN_PREFIX = "unbrewed-pro-token-";
// Deploy-safe games (protocol v7): the server pushes an opaque, encrypted resume
// blob per seat; we stash the latest one here so a redeploy/crash (which destroys
// the in-memory room) can be revived via RESUME_ROOM. localStorage, not
// sessionStorage — it must survive a full reload and "resume tomorrow".
const RESUME_PREFIX = "unbrewed-pro-resume-";
// Which seats of a room are AI (#876). Only ROOM_STATUS says so on the wire, and
// a bot room (started straight from CREATE_ROOM) or a mid-game RECONNECT never
// receives one — so what this browser learned is kept per room, beside the
// token, for the winner screen's Rematch link to read back after a reload.
const BOTS_PREFIX = "unbrewed-pro-bots-";
const RECENT_KEY = "unbrewed-pro-recent-rooms";
const MAX_RECENT = 5;
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // in-memory server rooms never outlive this

const canStore = () => typeof window !== "undefined";

// ---------------------------------------------------------------------------
// Writes that never throw (#1550)
// ---------------------------------------------------------------------------
//
// Every write below goes through `writeItem`. A full origin used to make
// setItem throw straight out of the socket handler, skipping the rest of that
// message (ROOM_CREATED lost its token, REMATCH_READY its stepRematch). Now a
// quota error first frees what is safe to free — stale Pro room keys, then the
// oldest UNSTARRED replays — and retries; if the write still fails it is
// reported as a handled exception and dropped.

const ROOM_KEY_PREFIXES = [TOKEN_PREFIX, RESUME_PREFIX, BOTS_PREFIX];

function isQuotaError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const { name, code } = e as { name?: unknown; code?: unknown };
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED" || code === 22 || code === 1014;
}

function tryWrite(storage: Storage, key: string, value: string): unknown {
  try {
    storage.setItem(key, value);
    return null;
  } catch (e) {
    return e ?? new Error("setItem failed");
  }
}

/** Key families already reported this page load — a full browser fails on
 *  every move, and one report per kind says everything. */
const reported = new Set<string>();

function reportWriteFailure(key: string, error: unknown): void {
  const family = ROOM_KEY_PREFIXES.find((p) => key.startsWith(p)) ?? key;
  if (reported.has(family)) return;
  reported.add(family);
  captureException(error, { handled: true, storage_key: family, source: "pro_recent_rooms" });
}

/** Store a value; true when it landed. Never throws. */
function writeItem(storage: Storage, key: string, value: string): boolean {
  let error = tryWrite(storage, key, value);
  if (!error) return true;
  if (isQuotaError(error) && storage === window.localStorage) {
    if (sweepStaleRoomKeys().length > 0) {
      error = tryWrite(storage, key, value);
      if (!error) return true;
    }
    // UTF-16 in the quota: twice the characters, a safe over-estimate. Evicts
    // nothing when even every evictable replay together could not make room.
    if (evictOldestUnstarred((key.length + value.length) * 2).length > 0) {
      error = tryWrite(storage, key, value);
      if (!error) return true;
    }
  }
  reportWriteFailure(key, error);
  return false;
}

// ---------------------------------------------------------------------------
// Room liveness by age (#1550)
// ---------------------------------------------------------------------------
//
// `TOUCHED_KEY` maps roomId → the last time any of its keys was written. A room
// is dead — and its keys sweepable — only once untouched for MAX_AGE_MS (the
// server never keeps a room that long), or when its game ends
// (retireFinishedRoom) or fails (forgetRoom). Membership of the 5-entry
// recent-rooms list says nothing: a long game in another tab can fall out of it
// while very much alive. A live game re-stamps on every move (RESUME_TOKEN).

const TOUCHED_KEY = "unbrewed-pro-room-touched";

function readTouched(): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(TOUCHED_KEY) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/** Rewrite the touched index; a failure only loses stamps (never throws). */
function writeTouched(touched: Record<string, number>): void {
  if (Object.keys(touched).length === 0) localStorage.removeItem(TOUCHED_KEY);
  else tryWrite(localStorage, TOUCHED_KEY, JSON.stringify(touched));
}

/** Write a browser-wide room key and stamp its room as touched now. */
function writeRoomItem(prefix: string, roomId: string, value: string): boolean {
  const touched = readTouched();
  touched[roomId] = Date.now();
  // Stamp first: a landed key must never look unstamped (= sweepable).
  writeItem(localStorage, TOUCHED_KEY, JSON.stringify(touched));
  return writeItem(localStorage, prefix + roomId, value);
}

function untouch(roomId: string): void {
  const touched = readTouched();
  if (!(roomId in touched)) return;
  delete touched[roomId];
  writeTouched(touched);
}

/** Last-touched time per room; keys written before #1550 carry no stamp and
 *  fall back to their recent-rooms entry (no entry → long dead). */
function lastTouched(roomId: string, touched: Record<string, number>, recent: Map<string, number>): number {
  const ts = touched[roomId];
  if (typeof ts === "number") return ts;
  return recent.get(roomId) ?? 0;
}

/** The recent-rooms index as stored (unfiltered, never throws). */
function readRecentIndex(): RecentRoom[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as RecentRoom[]) : [];
  } catch {
    return [];
  }
}

/**
 * Delete every Pro room key (token / resume blob / bots) in localStorage whose
 * room has gone untouched for MAX_AGE_MS — the server can no longer hold such a
 * room, so nothing can use it. Returns the keys removed. Also drops expired
 * stamps. sessionStorage is left alone.
 */
export function sweepStaleRoomKeys(now: number = Date.now()): string[] {
  if (!canStore()) return [];
  const touched = readTouched();
  const recent = new Map<string, number>();
  for (const r of readRecentIndex()) {
    if (r && typeof r.roomId === "string" && typeof r.ts === "number") recent.set(r.roomId, r.ts);
  }
  const isDead = (roomId: string) => now - lastTouched(roomId, touched, recent) >= MAX_AGE_MS;
  const stale: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    const prefix = key ? ROOM_KEY_PREFIXES.find((p) => key.startsWith(p)) : undefined;
    if (key && prefix && isDead(key.slice(prefix.length))) stale.push(key);
  }
  for (const key of stale) localStorage.removeItem(key);
  let pruned = false;
  for (const roomId of Object.keys(touched)) {
    if (isDead(roomId)) {
      delete touched[roomId];
      pruned = true;
    }
  }
  if (pruned) writeTouched(touched);
  return stale;
}

let sweptThisLoad = false;

/** `sweepStaleRoomKeys`, at most once per page load. */
export function sweepStaleRoomKeysOnce(): void {
  if (sweptThisLoad || !canStore()) return;
  sweptThisLoad = true;
  sweepStaleRoomKeys();
}

/**
 * A room's game is over (a STATE with a winner): drop its browser-wide copies —
 * the resume blob (nothing revives a finished game), the localStorage token and
 * the bots record. What the result screen still needs stays in THIS tab's
 * sessionStorage: the seat token (a reload re-binds, Rematch re-binds) and the
 * bots (the winner screen's Rematch link, REMATCH_READY copying them forward).
 */
export function retireFinishedRoom(roomId: string): void {
  if (!canStore()) return;
  localStorage.removeItem(RESUME_PREFIX + roomId);
  untouch(roomId);
  const token = localStorage.getItem(TOKEN_PREFIX + roomId);
  // A tab seated from the browser-wide copy (resumed in a new tab) holds no
  // session token yet — hand it over before the shared copy goes.
  if (token !== null && sessionStorage.getItem(TOKEN_PREFIX + roomId) === null) {
    writeItem(sessionStorage, TOKEN_PREFIX + roomId, token);
  }
  localStorage.removeItem(TOKEN_PREFIX + roomId);
  const bots = localStorage.getItem(BOTS_PREFIX + roomId);
  if (bots !== null) {
    writeItem(sessionStorage, BOTS_PREFIX + roomId, bots);
    localStorage.removeItem(BOTS_PREFIX + roomId);
  }
}

/**
 * THIS TAB's seat token (sessionStorage). Tabs must not share seats: with a
 * shared token, a second tab opening the join link would RECONNECT into the
 * host's seat instead of joining as the opponent (the two-tab solo test).
 */
export function getTabToken(roomId: string): string | null {
  if (!canStore()) return null;
  return sessionStorage.getItem(TOKEN_PREFIX + roomId);
}

/** Any seat token this browser holds — tab's own seat first. */
export function getToken(roomId: string): string | null {
  if (!canStore()) return null;
  return (
    sessionStorage.getItem(TOKEN_PREFIX + roomId) ??
    localStorage.getItem(TOKEN_PREFIX + roomId)
  );
}

export function setToken(roomId: string, token: string): void {
  if (!canStore()) return;
  writeItem(sessionStorage, TOKEN_PREFIX + roomId, token); // this tab's seat
  writeRoomItem(TOKEN_PREFIX, roomId, token); // browser-wide resume
}

/**
 * Store the latest resume blob (protocol v7 RESUME_TOKEN) for a room. Opaque and
 * encrypted server-side — we never read it, only hand it back in RESUME_ROOM.
 */
export function setResumeToken(roomId: string, blob: string): void {
  if (!canStore()) return;
  writeRoomItem(RESUME_PREFIX, roomId, blob);
}

/** The stored resume blob for a room, or null. Used to revive after a redeploy. */
export function getResumeToken(roomId: string): string | null {
  if (!canStore()) return null;
  return localStorage.getItem(RESUME_PREFIX + roomId);
}

/** Record which seats of a room are bots (seat → difficulty). */
export function setRoomBots(roomId: string, bots: RoomBots): void {
  if (!canStore()) return;
  const raw = JSON.stringify(bots);
  writeRoomItem(BOTS_PREFIX, roomId, raw);
  // A finished room keeps its bots in this tab only (retireFinishedRoom).
  if (sessionStorage.getItem(BOTS_PREFIX + roomId) !== null) writeItem(sessionStorage, BOTS_PREFIX + roomId, raw);
}

/** The recorded bot seats of a room, or null when this browser never learned
 *  them (a garbled entry reads as unknown, never as "no bots"). */
export function getRoomBots(roomId: string): RoomBots | null {
  if (!canStore()) return null;
  try {
    const raw = localStorage.getItem(BOTS_PREFIX + roomId) ?? sessionStorage.getItem(BOTS_PREFIX + roomId);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as RoomBots) : null;
  } catch {
    return null;
  }
}

export function listRecentRooms(): RecentRoom[] {
  if (!canStore()) return [];
  let parsed: RecentRoom[] = [];
  try {
    parsed = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
  const now = Date.now();
  return parsed
    .filter((r) => r && typeof r.roomId === "string" && now - r.ts < MAX_AGE_MS)
    .filter((r) => getToken(r.roomId) !== null)
    .sort((a, b) => b.ts - a.ts);
}

export function rememberRoom(roomId: string): void {
  if (!canStore()) return;
  const rest = listRecentRooms().filter((r) => r.roomId !== roomId);
  const next = [{ roomId, ts: Date.now() }, ...rest].slice(0, MAX_RECENT);
  writeItem(localStorage, RECENT_KEY, JSON.stringify(next));
}

export function forgetRoom(roomId: string): void {
  if (!canStore()) return;
  localStorage.removeItem(TOKEN_PREFIX + roomId);
  sessionStorage.removeItem(TOKEN_PREFIX + roomId);
  localStorage.removeItem(RESUME_PREFIX + roomId);
  localStorage.removeItem(BOTS_PREFIX + roomId);
  sessionStorage.removeItem(BOTS_PREFIX + roomId);
  untouch(roomId);
  const next = listRecentRooms().filter((r) => r.roomId !== roomId);
  writeItem(localStorage, RECENT_KEY, JSON.stringify(next));
}

// ---------------------------------------------------------------------------
// Recently-played fighters (issue #768)
// ---------------------------------------------------------------------------
//
// The lobby's "Recently played" roster row. Purely a browser convenience — the
// server neither reads nor writes it — so it lives beside the recent-rooms
// index rather than behind the account API: a signed-out player gets the row
// too, and no create/join frame changes shape because of it.
//
// Only CONCRETE hero ids are stored: the Random sentinel is resolved before
// create/join, so what lands here is always the fighter actually played.

const RECENT_HEROES_KEY = "unbrewed-pro-recent-heroes";
/** Kept a little longer than the row shows (4) so a stale/removed hero can drop
 *  out without instantly shortening the row. */
const MAX_RECENT_HEROES = 8;

/** Hero ids this browser has played, most recent first. */
export function listRecentHeroes(): string[] {
  if (!canStore()) return [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_HEROES_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((h): h is string => typeof h === "string" && h.length > 0);
  } catch {
    return [];
  }
}

/** Record a fighter as just-played (dedup, most recent first). */
export function rememberHero(heroId: string): void {
  if (!canStore() || !heroId) return;
  const next = [heroId, ...listRecentHeroes().filter((h) => h !== heroId)].slice(
    0,
    MAX_RECENT_HEROES,
  );
  writeItem(localStorage, RECENT_HEROES_KEY, JSON.stringify(next));
}
