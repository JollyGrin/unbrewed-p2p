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

export interface RecentRoom {
  roomId: string;
  ts: number; // last time this browser was seated (ms epoch)
}

const TOKEN_PREFIX = "unbrewed-pro-token-";
const RECENT_KEY = "unbrewed-pro-recent-rooms";
const MAX_RECENT = 5;
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // in-memory server rooms never outlive this

const canStore = () => typeof window !== "undefined";

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
  sessionStorage.setItem(TOKEN_PREFIX + roomId, token); // this tab's seat
  localStorage.setItem(TOKEN_PREFIX + roomId, token); // browser-wide resume
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
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

export function forgetRoom(roomId: string): void {
  if (!canStore()) return;
  localStorage.removeItem(TOKEN_PREFIX + roomId);
  sessionStorage.removeItem(TOKEN_PREFIX + roomId);
  const next = listRecentRooms().filter((r) => r.roomId !== roomId);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}
