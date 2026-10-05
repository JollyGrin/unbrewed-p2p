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
            : res.status === 400
              ? "invalid"
              : code === "signup_closed" ||
                  code === "full" ||
                  code === "already_joined"
                ? code
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
