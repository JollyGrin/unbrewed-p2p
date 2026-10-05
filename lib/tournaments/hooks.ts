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
  const [state, setState] = useState<Loaded<T>>({ status: "loading" });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!load) return;
    let alive = true;
    void load().then((r) => alive && setState(toLoaded(r)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, n]);
  const reload = useCallback(() => setN((v) => v + 1), []);
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

export const useTournament = (slug: string | null) =>
  useLoad<{ tournament: Tournament; entries: Entry[]; matches: Match[]; standings: Standing[] | null }>(
    slug ? () => getTournament(slug) : null,
    slug ?? "",
  );

/**
 * The match page's match (#1218), re-fetched every `pollMs` until it is decided —
 * an opponent's "I'm ready" or a finished game shows up without a refresh.
 */
export const useMatchDetail = (slug: string, matchId: string, pollMs = 10_000) => {
  const [loaded, reload] = useLoad<MatchDetail>(() => getMatch(slug, matchId), `${slug}/${matchId}`);
  // A poll that fails (or is still in flight) keeps showing the last good match.
  const last = useRef<Loaded<MatchDetail> | null>(null);
  if (loaded.status === "ready") last.current = loaded;
  const state = loaded.status !== "ready" && last.current ? last.current : loaded;
  const decided = state.status === "ready" && state.value.match.status === "decided";
  useEffect(() => {
    if (decided || pollMs <= 0) return;
    const id = window.setInterval(reload, pollMs);
    return () => window.clearInterval(id);
  }, [decided, pollMs, reload]);
  return [state, reload] as const;
};

/** `Date.now()`, re-read every `ms` — for countdowns. */
export const useNow = (ms = 1000): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
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
