/**
 * Fetch layer for the tournaments API (unbrewed-api `docs/tournaments-api.md`).
 * Same contract as lib/account/badges: never throws; every failure is a typed
 * reason. Cookie-credentialed, JSON in and out.
 */
import { API_URL } from "@/lib/account/apiUrl";

import { noteServerDate } from "./serverClock";

import type {
  CreateTournamentBody,
  Entry,
  Match,
  Standing,
  MatchDetail,
  MyTournaments,
  NextMatch,
  TicketGrant,
  MatchupRule,
  Tournament,
} from "./types";

export type TournamentFailure =
  | "unauthorized"
  | "not_found"
  | "signup_closed"
  | "full"
  | "already_joined"
  | "rate_limited"
  | "invalid"
  /** 403: e.g. `not_in_match` — only the match's two players may play it. */
  | "forbidden"
  /** 409: `match_not_open`, `match_in_play`, `not_running` (see `code`). */
  | "conflict"
  | "unavailable";

export type Result<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      reason: TournamentFailure;
      code?: string;
      message?: string;
      roomId?: string | null;
      /** `409 tickets_outstanding` (api #101): when the blocking join tickets run out, and whether `force` is allowed. */
      ticketsExpireAt?: string;
      canForce?: boolean;
    };

/** A GET that has not answered in this long is a network failure (#1265). */
export const REQUEST_TIMEOUT_MS = 10_000;
/** Large GET bodies (a replay bundle) on a slow mobile link. */
export const LARGE_GET_TIMEOUT_MS = 30_000;
/** A write that has not answered in this long gives the button back (p2p #1269). */
export const WRITE_TIMEOUT_MS = 30_000;
/**
 * A timed-out write may still have happened server-side (the api can wait on
 * Discord), so the retry copy says to look before pressing again.
 */
export const WRITE_TIMEOUT_MESSAGE =
  "The server didn't answer in time. It may still have gone through: reload the page to check before trying again.";

const call = async <T>(
  path: string,
  init: RequestInit | undefined,
  pick: (body: any) => T,
  timeoutMs?: number,
): Promise<Result<T>> => {
  const ctl = new AbortController();
  // Writes get a longer limit than reads (the api can wait on Discord), but a
  // bound all the same: a hung api must not leave Join/Start/Override busy until
  // the browser gives up. Their timeout copy warns it may have gone through.
  const isGet = !init?.method || init.method.toUpperCase() === "GET";
  const limit = timeoutMs ?? (isGet ? REQUEST_TIMEOUT_MS : WRITE_TIMEOUT_MS);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctl.abort();
  }, limit);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      credentials: "include",
      ...init,
      signal: ctl.signal,
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers as Record<string, string> | undefined),
      },
    });
    noteServerDate(res.headers?.get?.("Date"));
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      /* no body */
    }
    // The api's "your seat is already held" answer (#1248) as a 409. As a 200 it
    // is a grant like any other (p2p #1250): its ticket goes back into the
    // caller's own room, or finishes opening it — `decision` says which.
    const roomId: string | null = typeof body?.roomId === "string" ? body.roomId : null;
    if (res.ok) return { ok: true, value: pick(body) };
    if (body?.decision === "seat_held") return { ok: false, reason: "conflict", code: "seat_held", roomId };
    const code: string | undefined =
      typeof body?.error === "string" ? body.error : undefined;
    const message: string | undefined =
      typeof body?.message === "string" ? body.message : undefined;
    const reason: TournamentFailure =
      res.status === 401
        ? "unauthorized"
        : res.status === 404
          ? "not_found"
          : res.status === 429
            ? "rate_limited"
            : res.status === 403
              ? "forbidden"
            : res.status === 400
              ? "invalid"
              : code === "signup_closed" ||
                  code === "full" ||
                  code === "already_joined"
                ? code
                : res.status === 409
                  ? "conflict"
                  : "unavailable";
    const extra =
      code === "tickets_outstanding" && typeof body?.ticketsExpireAt === "string"
        ? { ticketsExpireAt: body.ticketsExpireAt as string, canForce: body.canForce === true }
        : code === "reseat_cooldown" && typeof body?.ticketsExpireAt === "string"
          ? { ticketsExpireAt: body.ticketsExpireAt as string }
          : {};
    return { ok: false, reason, code, message, ...(roomId ? { roomId } : {}), ...extra };
  } catch {
    return timedOut && !isGet
      ? { ok: false, reason: "unavailable", code: "timeout", message: WRITE_TIMEOUT_MESSAGE }
      : { ok: false, reason: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
};

const list = (v: unknown): any[] => (Array.isArray(v) ? v : []);

export const listTournaments = (opts: { mine?: boolean } = {}) =>
  call(`/tournaments${opts.mine ? "?mine=1" : ""}`, undefined, (b) => {
    // A non-JSON 200 (a proxy page) is a failure, never "No brackets here".
    if (!Array.isArray(b?.tournaments)) throw new Error("bad /tournaments body");
    return b.tournaments as Tournament[];
  });

/** The signed-in player's tournaments plus their next open match (#1220). */
export const getMyTournaments = () =>
  call("/me/tournaments", undefined, (b): MyTournaments => {
    // Not the documented shape (a stub, a proxy page) = the api is unavailable.
    if (!Array.isArray(b?.tournaments)) throw new Error("bad /me/tournaments body");
    return {
      tournaments: b.tournaments as Tournament[],
      nextMatch:
        b.nextMatch?.match && b.nextMatch.tournament?.slug
          ? (b.nextMatch as NextMatch)
          : null,
    };
  });

export const getTournament = (slug: string) =>
  call(`/tournaments/${encodeURIComponent(slug)}`, undefined, (b) => ({
    tournament: b.tournament as Tournament,
    entries: list(b.entries) as Entry[],
    matches: list(b.matches) as Match[],
    standings: Array.isArray(b.standings) ? (b.standings as Standing[]) : null,
  }));

/**
 * Organizer: edit a draft/signup tournament, open signup (`status: 'signup'`),
 * cancel (`status: 'cancelled'`) or move `signupClosesAt` (extend signup).
 * Cancelling a running event and extending past a passed close time depend on
 * unbrewed-api #91: until then the api answers 409/400 and the caller shows
 * its message.
 */
export type TournamentPatch = Partial<
  Pick<CreateTournamentBody, "name" | "size" | "matchWindowHours" | "matchupRule" | "roundMaps" | "signupClosesAt" | "settings">
> & { status?: "signup" | "cancelled" };

export const patchTournament = (slug: string, body: TournamentPatch) =>
  call(
    `/tournaments/${encodeURIComponent(slug)}`,
    { method: "PATCH", body: JSON.stringify(body) },
    (b) => b.tournament as Tournament,
  );

export const createTournament = (body: CreateTournamentBody) =>
  call(
    "/tournaments",
    { method: "POST", body: JSON.stringify(body) },
    (b) => b.tournament as Tournament,
  );

export const joinTournament = (slug: string) =>
  call(
    `/tournaments/${encodeURIComponent(slug)}/entries`,
    { method: "POST" },
    (b) => b.entry as Entry,
  );

export const leaveTournament = (slug: string) =>
  call(
    `/tournaments/${encodeURIComponent(slug)}/entries/me`,
    { method: "DELETE" },
    () => true,
  );

/** Organizer, before start: `order` is every active entry id, best seed first. */
export const putSeeds = (slug: string, order: readonly string[]) =>
  call(
    `/tournaments/${encodeURIComponent(slug)}/seeds`,
    { method: "PUT", body: JSON.stringify({ order }) },
    (b) => list(b?.entries) as Entry[],
  );

/** Organizer: build the bracket and open round 1. */
export const startTournament = (slug: string) =>
  call(
    `/tournaments/${encodeURIComponent(slug)}/start`,
    { method: "POST" },
    (b) => ({
      tournament: b.tournament as Tournament,
      entries: list(b.entries) as Entry[],
      matches: list(b.matches) as Match[],
    }),
  );

const matchPath = (slug: string, matchId: string) =>
  `/tournaments/${encodeURIComponent(slug)}/matches/${encodeURIComponent(matchId)}`;

/** Public: one match with its players, ready-checks and live room. */
export const getMatch = (slug: string, matchId: string) =>
  call(matchPath(slug, matchId), undefined, (b) => ({
    match: b.match as Match,
    tournament: b.tournament as MatchDetail["tournament"],
    players: { a: b.players?.a ?? null, b: b.players?.b ?? null },
    decision: (b.decision ?? null) as MatchDetail["decision"],
    readyChecks: list(b.readyChecks) as MatchDetail["readyChecks"],
    liveRoom: (b.liveRoom ?? null) as MatchDetail["liveRoom"],
  }));

const grant = (b: any): TicketGrant => ({
  action: b.action === "join" ? "join" : "create",
  ticket: String(b.ticket ?? ""),
  gameIndex: Number(b.gameIndex ?? 0),
  slot: b.slot === "b" ? "b" : "a",
  heroId: typeof b.heroId === "string" ? b.heroId : null,
  map: b.map ?? null,
  ticketExpiresAt: String(b.ticketExpiresAt ?? ""),
  roomId: typeof b.roomId === "string" ? b.roomId : null,
  ...(b.decision === "create" || b.decision === "join" || b.decision === "seat_held" ? { decision: b.decision } : {}),
});

/**
 * `409 reseat_cooldown` (api #126): an organizer force re-seat closes Play until
 * `ticketsExpireAt`. Remembered per match so the match page can show the same
 * "Play opens at" notice as the match JSON's `reseatCooldownUntil`, whatever
 * copy the play hook gives the error.
 */
const reseatCooldowns = new Map<string, string>();
export const noticedReseatCooldown = (matchId: string): string | null => reseatCooldowns.get(matchId) ?? null;
const noteCooldown =
  (matchId: string) =>
  <T>(r: Result<T>): Result<T> => {
    if (!r.ok && r.code === "reseat_cooldown" && r.ticketsExpireAt) reseatCooldowns.set(matchId, r.ticketsExpireAt);
    return r;
  };
export const __resetReseatCooldownsForTests = () => reseatCooldowns.clear();

/** "I'm ready" / "Join now": records a ready-check and grants a ticket. */
export const readyForMatch = (slug: string, matchId: string) =>
  call(`${matchPath(slug, matchId)}/ready`, { method: "POST" }, grant).then(noteCooldown(matchId));

/**
 * A fresh ticket, recording nothing (a retry, or waiting on the other room's id).
 * A POST with a JSON content type (hardening contract item 1, #1268) so no
 * simple cross-site request can mint one; no body. It records nothing, so it
 * keeps a read's timeout.
 */
export const getMatchTicket = (slug: string, matchId: string) =>
  call(
    `${matchPath(slug, matchId)}/ticket`,
    { method: "POST", headers: { "Content-Type": "application/json" } },
    grant,
    REQUEST_TIMEOUT_MS,
  ).then(noteCooldown(matchId));

/**
 * The engine answered ROOM_NOT_FOUND for this match's room (an engine restart
 * while it waited): ask the api to forget it so the next `/ready` creates a
 * fresh one (hardening contract item 2, #1268). Idempotent; `cleared: false`
 * = the api still trusts that room (or it already moved on). An api without
 * the route answers 404 (`not_found`).
 */
export const reportRoomGone = (slug: string, matchId: string, roomId: string) =>
  call(
    `${matchPath(slug, matchId)}/room-gone`,
    { method: "POST", body: JSON.stringify({ roomId }) },
    (b) => ({ cleared: b?.cleared === true }),
    REQUEST_TIMEOUT_MS,
  );

/**
 * A game's replay bundle. ASSUMED route: the api's replay route lands at the end
 * of the epic (#1196) and isn't documented yet — the match page only calls this
 * for a game the api marks `replayAvailable`, so nothing reaches it until then.
 * Accepts `{bundle}` or the share route's `{replay: {bundle}}`.
 */
export const getGameReplay = (slug: string, matchId: string, gameIndex: number) =>
  call(
    `${matchPath(slug, matchId)}/games/${gameIndex}/replay`,
    undefined,
    (b) => (b?.bundle ?? b?.replay?.bundle ?? null) as unknown,
    LARGE_GET_TIMEOUT_MS,
  );
/** Organizer: one item of the "Needs your attention" queue (`GET …/attention`). */
export type AttentionItem = {
  matchId: string;
  round: number;
  position: number;
} & (
  | {
      kind: "awaiting_organizer";
      deadlineAt: string;
      until: string;
      /** api #88: `ready_hold_pending` = a player pressed Play and the seat hold is still live; else `no_ready_check`. */
      reason?: "ready_hold_pending" | "no_ready_check";
      /** When the latest hold expires (null without one). */
      holdUntil?: string | null;
      /** Entry ids that pressed Play and hold a seat. */
      readyBy?: string[];
      readyChecks?: { entryId: string; expiresAt: string; outcome: "pending" | "answered" | "unanswered" }[];
    }
  | {
      kind: "deadline_passed";
      deadlineAt: string;
      winner: string | null;
      decidedBy: string | null;
    }
  | { kind: "unverified_game"; gameIndex: number; winnerEntry: string | null }
  | { kind: "entrant_left"; entryId: string }
  | { kind: "no_matchup" }
);

export const getAttention = (slug: string) =>
  call(
    `/tournaments/${encodeURIComponent(slug)}/attention`,
    undefined,
    (b) => list(b?.items) as AttentionItem[],
  );

/** Organizer: confirm an unverified, finished game (one click). */
export const confirmGame = (slug: string, matchId: string, gameIndex: number) =>
  call(
    `${matchPath(slug, matchId)}/games/${gameIndex}/confirm`,
    { method: "POST" },
    (b) => b,
  );

/**
 * Organizer: decide a match. To re-decide an already-decided match pass
 * `replacesWinner` = the current winner (api #73), else 409 match_already_decided.
 */
export const overrideMatch = (
  slug: string,
  matchId: string,
  body: { winnerEntry: string; note?: string; replacesWinner?: string; force?: boolean },
) =>
  call(
    `${matchPath(slug, matchId)}/override`,
    { method: "POST", body: JSON.stringify(body) },
    (b) => b,
  );

/**
 * Organizer: reject an unverified, finished game ("Not valid", api #75). The
 * game row stays with `rejectedAt` set; nothing is decided. A verified game
 * answers 409 already_verified (re-decide with override + replacesWinner).
 */
export const rejectGame = (
  slug: string,
  matchId: string,
  gameIndex: number,
  note?: string,
) =>
  call(
    `${matchPath(slug, matchId)}/games/${gameIndex}/reject`,
    { method: "POST", body: JSON.stringify(note?.trim() ? { note: note.trim() } : {}) },
    (b) => ({ match: b.match as Match, deadline: b.deadline as unknown }),
  );

/** Organizer: set a match's matchup; `null` clears the override. */
export const putMatchup = (
  slug: string,
  matchId: string,
  matchupRule: MatchupRule | null,
) =>
  call(
    `${matchPath(slug, matchId)}/matchup`,
    { method: "PUT", body: JSON.stringify({ matchupRule }) },
    (b) => b.match as Match,
  );
