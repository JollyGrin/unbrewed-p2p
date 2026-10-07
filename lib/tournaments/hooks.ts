/** Small load-once hooks over ./api (component state; no shared store needed). */
import { useCallback, useEffect, useRef, useState } from "react";

import {
  getMatch,
  getAttention,
  getTournament,
  type AttentionItem,
  listTournaments,
  type Result,
} from "./api";
import { NOT_FOUND_LIMIT, useFailureCount, usePoll } from "./poll";
import { serverNow } from "./serverClock";
import type { Entry, Match, MatchDetail, Standing, Tournament } from "./types";

export type Loaded<T> =
  | { status: "loading" }
  | { status: "ready"; value: T }
  | { status: "not_found" }
  | { status: "unavailable" };

const toLoaded = <T,>(r: Result<T>): Loaded<T> =>
  r.ok
    ? { status: "ready", value: r.value }
    : r.reason === "not_found"
      ? { status: "not_found" }
      : { status: "unavailable" };

function useLoad<T>(
  load: (() => Promise<Result<T>>) | null,
  key: string,
): [Loaded<T>, () => void] {
  // The result remembers which key it answered: a different key is a different
  // thing, and never shows the previous one's data (not even for one render).
  const [res, setRes] = useState<{ key: string; state: Loaded<T> } | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!load) return;
    let alive = true;
    void load().then((r) => alive && setRes({ key, state: toLoaded(r) }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, n]);
  const reload = useCallback(() => setN((v) => v + 1), []);
  const state: Loaded<T> = res && res.key === key ? res.state : { status: "loading" };
  return [state, reload];
}

export const useTournamentList = (signedIn: boolean) => {
  const [all, reloadAll] = useLoad(() => listTournaments(), "all");
  const [mine] = useLoad(
    signedIn ? () => listTournaments({ mine: true }) : null,
    signedIn ? "mine" : "guest",
  );
  return { all, mine, reload: reloadAll };
};

type TournamentData = { tournament: Tournament; entries: Entry[]; matches: Match[]; standings: Standing[] | null };

/**
 * After a match is decided or an event completes, a slow poll still picks up an
 * organizer's correction without a reload (p2p #1269). Same pause/backoff rules.
 */
export const SETTLED_POLL_MS = 60_000;

/**
 * The event/bracket page's tournament, re-fetched every `pollMs` while it is
 * running and the tab is visible (E2, #1236), every SETTLED_POLL_MS once it is
 * complete; a draft/signup/cancelled event stands still. A poll that fails
 * keeps showing the last good data.
 */
export const useTournament = (slug: string | null, pollMs = 10_000) => {
  const [loaded, reload] = useLoad<TournamentData>(slug ? () => getTournament(slug) : null, slug ?? "");
  const last = useRef<{ slug: string | null; loaded: Loaded<TournamentData> } | null>(null);
  if (loaded.status === "ready") last.current = { slug, loaded };
  const state =
    loaded.status === "unavailable" && last.current?.slug === slug ? last.current.loaded : loaded;
  const status = state.status === "ready" ? state.value.tournament.status : null;
  const streak = useFailureCount(loaded.status, loaded);
  usePoll(
    (status === "running" || status === "complete") && streak.notFound < NOT_FOUND_LIMIT,
    status === "complete" ? Math.max(pollMs, SETTLED_POLL_MS) : pollMs,
    streak.failures,
    reload,
  );
  return [state, reload] as const;
};

/**
 * The match page's match (#1218), re-fetched every `pollMs` (paused while the tab is hidden, backed off on errors) —
 * an opponent's "I'm ready" or a finished game shows up without a refresh. A decided match
 * keeps a slow SETTLED_POLL_MS poll so an organizer's correction appears (p2p #1269).
 */
export const useMatchDetail = (slug: string, matchId: string, pollMs = 10_000) => {
  const key = `${slug}/${matchId}`;
  const [loaded, reload] = useLoad<MatchDetail>(() => getMatch(slug, matchId), key);
  // A poll that fails (or is still in flight) keeps showing the last good match —
  // of THIS match only: a new matchId never shows the previous match's data.
  const last = useRef<{ key: string; loaded: Loaded<MatchDetail> } | null>(null);
  if (loaded.status === "ready") last.current = { key, loaded };
  const kept = last.current?.key === key ? last.current.loaded : null;
  const state = loaded.status !== "ready" && kept ? kept : loaded;
  const streak = useFailureCount(loaded.status, loaded);
  // Cancelled (the match or its tournament) and two 404s in a row are final: stop asking.
  const stopped =
    streak.notFound >= NOT_FOUND_LIMIT ||
    (state.status === "ready" && (!!state.value.match.cancelled || state.value.tournament.status === "cancelled"));
  const decided = state.status === "ready" && state.value.match.status === "decided";
  usePoll(!stopped, decided ? Math.max(pollMs, SETTLED_POLL_MS) : pollMs, streak.failures, reload);
  return [state, reload] as const;
};

/** Now on the api's clock (lib/tournaments/serverClock), re-read every `ms` — for countdowns. */
export const useNow = (ms = 1000): number => {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    const id = window.setInterval(() => setNow(serverNow()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
};
/** Organizer-only queue; pass `enabled=false` for everyone else (no request). */
export const useAttention = (slug: string, enabled: boolean) =>
  useLoad<AttentionItem[]>(
    enabled ? () => getAttention(slug) : null,
    enabled ? `attention:${slug}` : "off",
  );

export type AttentionQueueData = readonly [Loaded<AttentionItem[]>, () => void];

/**
 * The event page's ONE attention-queue load (p2p #1269), refreshed whenever the
 * page's own poll brings new `matches` (never on the first render: the load
 * itself covers that). A failed refresh keeps the last good queue.
 */
export const useAttentionQueue = (slug: string, enabled: boolean, matches: unknown): AttentionQueueData => {
  const [loaded, reload] = useAttention(slug, enabled);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (enabled) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches]);
  const last = useRef<Loaded<AttentionItem[]> | null>(null);
  if (loaded.status === "ready") last.current = loaded;
  return [loaded.status !== "ready" && last.current && enabled ? last.current : loaded, reload] as const;
};
