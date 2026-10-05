/**
 * Fetch layer for the tournaments API (unbrewed-api `docs/tournaments-api.md`).
 * Same contract as lib/account/badges: never throws; every failure is a typed
 * reason. Cookie-credentialed, JSON in and out.
 */
import { API_URL } from "@/lib/account/apiUrl";

import type {
  CreateTournamentBody,
  Entry,
  Match,
  MatchDetail,
  TicketGrant,
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
  | { ok: false; reason: TournamentFailure; code?: string; message?: string };

const call = async <T>(
  path: string,
  init: RequestInit | undefined,
  pick: (body: any) => T,
): Promise<Result<T>> => {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      credentials: "include",
      ...init,
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      /* no body */
    }
    if (res.ok) return { ok: true, value: pick(body) };
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
    return { ok: false, reason, code, message };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
};

const list = (v: unknown): any[] => (Array.isArray(v) ? v : []);

export const listTournaments = (opts: { mine?: boolean } = {}) =>
  call(`/tournaments${opts.mine ? "?mine=1" : ""}`, undefined, (b) =>
    list(b?.tournaments) as Tournament[],
  );

export const getTournament = (slug: string) =>
  call(`/tournaments/${encodeURIComponent(slug)}`, undefined, (b) => ({
    tournament: b.tournament as Tournament,
    entries: list(b.entries) as Entry[],
    matches: list(b.matches) as Match[],
  }));

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
});

/** "I'm ready" / "Join now": records a ready-check and grants a ticket. */
export const readyForMatch = (slug: string, matchId: string) =>
  call(`${matchPath(slug, matchId)}/ready`, { method: "POST" }, grant);

/** A fresh ticket, recording nothing (a retry, or waiting on the other room's id). */
export const getMatchTicket = (slug: string, matchId: string) =>
  call(`${matchPath(slug, matchId)}/ticket`, undefined, grant);

/**
 * A game's replay bundle. ASSUMED route: the api's replay route lands at the end
 * of the epic (#1196) and isn't documented yet — the match page only calls this
 * for a game the api marks `replayAvailable`, so nothing reaches it until then.
 * Accepts `{bundle}` or the share route's `{replay: {bundle}}`.
 */
export const getGameReplay = (slug: string, matchId: string, gameIndex: number) =>
  call(`${matchPath(slug, matchId)}/games/${gameIndex}/replay`, undefined, (b) => (b?.bundle ?? b?.replay?.bundle ?? null) as unknown);
