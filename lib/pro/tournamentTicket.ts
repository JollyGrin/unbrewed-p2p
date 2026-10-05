/**
 * Tournament tickets on /pro/game (#1218, engine #755, protocol v37).
 *
 * The match page presses "I'm ready" (`POST …/ready`) and hands the result to
 * `/pro/game` as query params — the same pattern lib/pro/rematch.ts uses for a
 * one-tap rematch. The page fires ONE CREATE_ROOM (or `?room=` + JOIN_ROOM)
 * carrying the opaque `ticket`, then drops these keys from the URL so a refresh
 * RECONNECTs with the seat token instead of spending the ticket again.
 *
 *   /pro/game?ticket=…&tour=<slug>&match=<matchId>[&lockHero=<heroId>][&lockMap=<kind>:<id>][&room=<roomId>]
 *
 * `lockHero` set → the hero picker is skipped. `lockMap` follows the engine's
 * map-identity rule (engine #755): `map.id` is the board's ProMapDef slug; an
 * engine board (`serverDefault`, Mended Drum) is sent as NO customMap, any other
 * catalog board as its full ProMapDef. The joiner sends no board at all — the
 * room already has one.
 *
 * The ticket itself is never parsed here: hero and map ride beside it.
 */
import type { ErrorCode, ProMapDef } from "./protocol";
import { matchHref } from "@/lib/tournaments/bracket";

import { catalogEntry, customMapForEntry, rollRandomMap } from "./mapCatalog";

export interface MapLock {
  kind: "catalog" | "custom";
  id: string;
}

/** What a `?ticket=` link asks the game page to do. */
export interface TicketLaunch {
  ticket: string;
  /** Tournament slug + match id: where "Back to the match" and a retry go. */
  slug: string;
  matchId: string;
  /** The opponent's room to JOIN; null = CREATE a tagged room. */
  room: string | null;
  /** The seat's hero when the matchup sets it (no picker); null = player picks. */
  heroId: string | null;
  /** The board the matchup sets; null = the creator's (here: a random roll). */
  map: MapLock | null;
}

export const TICKET_QUERY_KEYS = ["ticket", "tour", "match", "lockHero", "lockMap"] as const;

type Query = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined): string | null => {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === "string" && s.trim() !== "" ? s.trim() : null;
};

const parseMap = (raw: string | null): MapLock | null => {
  if (!raw) return null;
  const at = raw.indexOf(":");
  const kind = raw.slice(0, at);
  const id = raw.slice(at + 1);
  return at > 0 && id && (kind === "catalog" || kind === "custom") ? { kind, id } : null;
};

/** The `/pro/game` link for a ticket the api just granted. */
export function ticketGameHref(launch: TicketLaunch): string {
  const q = new URLSearchParams({ ticket: launch.ticket, tour: launch.slug, match: launch.matchId });
  if (launch.heroId) q.set("lockHero", launch.heroId);
  if (launch.map) q.set("lockMap", `${launch.map.kind}:${launch.map.id}`);
  if (launch.room) q.set("room", launch.room);
  return `/pro/game?${q.toString()}`;
}

/** A `?ticket=` launch, or null on every other /pro/game load. */
export function parseTicketQuery(query: Query): TicketLaunch | null {
  const ticket = one(query.ticket);
  const slug = one(query.tour);
  const matchId = one(query.match);
  if (!ticket || !slug || !matchId) return null;
  return {
    ticket,
    slug,
    matchId,
    room: one(query.room),
    heroId: one(query.lockHero),
    map: parseMap(one(query.lockMap)),
  };
}

/** The query minus the ticket's keys (`room` stays: it is the page's own). */
export function withoutTicketQuery(query: Query): Query {
  const out: Query = { ...query };
  for (const k of TICKET_QUERY_KEYS) delete out[k];
  return out;
}

export type TicketBoard =
  | { ok: true; mapId: string; customMap: ProMapDef | undefined }
  | { ok: false; message: string };

/**
 * The board a tagged CREATE_ROOM sends for a ticket's map lock. No lock → a
 * random duel board (the lobby's own default), since a ticket's game has no
 * board picker.
 */
export function ticketBoard(
  map: MapLock | null,
  roll: () => { id: string; map: ProMapDef; serverDefault?: boolean } = () => rollRandomMap("duel"),
): TicketBoard {
  if (!map) {
    const entry = roll();
    return { ok: true, mapId: entry.id, customMap: entry.serverDefault ? undefined : entry.map };
  }
  const entry = catalogEntry(map.id);
  if (map.kind === "catalog" && entry)
    return { ok: true, mapId: entry.id, customMap: customMapForEntry(entry) };
  return {
    ok: false,
    message:
      map.kind === "custom"
        ? "This match is set on a custom board, which this version of Unbrewed can't open yet."
        : `This match is set on a board this version of Unbrewed doesn't have (${map.id}). Refresh the page to update.`,
  };
}

/** The codes a ticket (or a tagged room) answers with. */
export const TICKET_ERROR_CODES: readonly ErrorCode[] = [
  "TICKET_INVALID",
  "TICKET_EXPIRED",
  "TICKET_MISMATCH",
  "TICKET_REQUIRED",
  "MATCHUP_LOCKED",
  "TOURNAMENTS_DISABLED",
];

/** Whether a fresh ticket from the match page can fix this error. */
export const ticketRetryable = (code: string): boolean =>
  code !== "TOURNAMENTS_DISABLED" && code !== "MATCHUP_LOCKED";

// --- which rooms are tournament rooms ---------------------------------------
// The engine never says (ROOM_JOINED/STATE carry no match id), so the tab that
// opened or joined the room remembers it — a refresh, or the game-over screen,
// still knows to hide Rematch and link back to the match page. Room codes are
// reused, so the note expires with the room (24h, like the recent-rooms list)
// and is dropped when this browser seats itself in an untagged room of that code.

const ROOM_KEY = "unbrewed-pro-tournament-room-";
export const TOURNAMENT_ROOM_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface TournamentRoom {
  slug: string;
  matchId: string;
}

export function rememberTournamentRoom(roomId: string, at: TournamentRoom, now: number = Date.now()): void {
  try {
    window.localStorage.setItem(ROOM_KEY + roomId, JSON.stringify({ ...at, ts: now }));
  } catch {
    /* storage blocked: this page load still has it in state */
  }
}

/** Drop the note: this browser is seated in an untagged room with this code. */
export function forgetTournamentRoom(roomId: string): void {
  try {
    window.localStorage.removeItem(ROOM_KEY + roomId);
  } catch {
    /* nothing stored */
  }
}

export function tournamentRoomOf(roomId: string | null, now: number = Date.now()): TournamentRoom | null {
  if (!roomId) return null;
  try {
    const raw = window.localStorage.getItem(ROOM_KEY + roomId);
    const v = raw ? JSON.parse(raw) : null;
    if (!v || typeof v.slug !== "string" || typeof v.matchId !== "string") return null;
    if (typeof v.ts !== "number" || now - v.ts > TOURNAMENT_ROOM_MAX_AGE_MS) {
      forgetTournamentRoom(roomId);
      return null;
    }
    return { slug: v.slug, matchId: v.matchId };
  } catch {
    return null;
  }
}

/** The match page this room belongs to. */
export const tournamentMatchHref = (at: TournamentRoom): string => matchHref(at.slug, at.matchId);

// --- a ticket fired but no room exists yet (E1, #1236) ------------------------
// The ticket leaves the URL the moment it fires (single use), but a player who
// presses F5 at the hero picker has no room to RECONNECT to. sessionStorage is
// per tab, so this note is exactly "this tab was mid-launch for this match".
// It is dropped as soon as a room exists (the room note takes over). The ticket
// itself is never stored: a refresh asks for a fresh one.

const PENDING_KEY = "unbrewed-pro-tournament-pending";
export const PENDING_PICK_MAX_AGE_MS = 30 * 60 * 1000;

export function rememberPendingPick(at: TournamentRoom, now: number = Date.now()): void {
  try {
    window.sessionStorage.setItem(PENDING_KEY, JSON.stringify({ slug: at.slug, matchId: at.matchId, ts: now }));
  } catch {
    /* storage blocked: a refresh falls back to the lobby */
  }
}

export function forgetPendingPick(): void {
  try {
    window.sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* nothing stored */
  }
}

export function pendingPick(now: number = Date.now()): TournamentRoom | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_KEY);
    const v = raw ? JSON.parse(raw) : null;
    if (!v || typeof v.slug !== "string" || typeof v.matchId !== "string") return null;
    if (typeof v.ts !== "number" || now - v.ts > PENDING_PICK_MAX_AGE_MS) {
      forgetPendingPick();
      return null;
    }
    return { slug: v.slug, matchId: v.matchId };
  } catch {
    return null;
  }
}
