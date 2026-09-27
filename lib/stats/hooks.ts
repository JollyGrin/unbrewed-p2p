/**
 * React hooks over ./client, in the lib/account house style: component state,
 * one request per key, no retry, and every failure a quiet status — never a
 * throw. A changed key drops the previous value immediately so the old
 * subject's numbers never sit under a new heading while the next request is in
 * flight.
 */
import { useEffect, useState } from "react";

import type { AccountGamesPage } from "@/lib/account/gameHistory";
import { GameHistoryView, usePagedGames } from "@/lib/account/useGameHistory";

import {
  fetchCommunity,
  fetchHeroStats,
  fetchStatsLeaderboard,
  fetchStatsPlayer,
  fetchStatsPlayerGames,
} from "./client";
import type {
  Community,
  HeroStats,
  StatsLeaderboard,
  StatsPlayer,
  StatsResult,
  StatsWindow,
} from "./types";

/**
 * - `loading`     — in flight, or the key (e.g. `?u=`) isn't known yet
 * - `not_found`   — only `/players?u=`: no account by that name
 * - `unavailable` — api down, rate limited, or a deploy without the route
 * - `ready`       — a value in hand
 */
export type StatsStatus = "loading" | "not_found" | "unavailable" | "ready";

export interface StatsView<T> {
  status: StatsStatus;
  data: T | null;
}

const LOADING = { status: "loading", data: null } as const;

/**
 * Shared body of every hook. `key` null = not ready to ask yet (stay loading
 * rather than flash an empty state); the fetcher is keyed by `key` alone.
 */
const useStatsResource = <T>(
  key: string | null,
  fetcher: () => Promise<StatsResult<T>>,
): StatsView<T> => {
  const [view, setView] = useState<StatsView<T>>(LOADING);

  useEffect(() => {
    setView(LOADING);
    if (key === null) return;
    let alive = true;
    void fetcher().then((result) => {
      if (!alive) return;
      if (result.ok) setView({ status: "ready", data: result.value });
      else
        setView({
          status: result.reason === "not_found" ? "not_found" : "unavailable",
          data: null,
        });
    });
    return () => {
      alive = false;
    };
    // The fetcher is re-created every render; `key` is what identifies it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return view;
};

export const useCommunity = (window: StatsWindow = "all"): StatsView<Community> =>
  useStatsResource(`community:${window}`, () => fetchCommunity(window));

export const useHeroStats = (
  heroId: string | null,
  window: StatsWindow = "all",
): StatsView<HeroStats> =>
  useStatsResource(heroId ? `hero:${heroId}:${window}` : null, () =>
    fetchHeroStats(heroId as string, window),
  );

export const useStatsLeaderboard = (
  options: { limit?: number; window?: StatsWindow } = {},
): StatsView<StatsLeaderboard> =>
  useStatsResource(
    `leaderboard:${options.limit ?? ""}:${options.window ?? "all"}`,
    () => fetchStatsLeaderboard(options),
  );

export const useStatsPlayer = (username: string | null): StatsView<StatsPlayer> =>
  useStatsResource(username ? `player:${username}` : null, () =>
    fetchStatsPlayer(username as string),
  );

/** The FIRST page of a player's games; paging is the page ticket's to own. */
export const useStatsPlayerGames = (
  username: string | null,
  limit?: number,
): StatsView<AccountGamesPage> =>
  useStatsResource(username ? `games:${username}:${limit ?? ""}` : null, () =>
    fetchStatsPlayerGames(username as string, { limit }),
  );

/**
 * A player's whole game history for the dashboard's Games card: the same
 * cursor walk `/account` uses (lib/account `usePagedGames`, "Older games"
 * appends a page), but through the stats client so the fixture switch covers
 * it too. Same statuses as `usePublicGameHistory`.
 */
export const useStatsPlayerGameHistory = (username: string | null): GameHistoryView => {
  const { games, loadingMore, hasMore, loadMore, loaded, failed } = usePagedGames(
    username,
    async (before) => {
      const result = await fetchStatsPlayerGames(username ?? "", { before });
      return result.ok
        ? result
        : { ok: false, reason: result.reason === "rate_limited" ? "rate_limited" : "unavailable" };
    },
  );
  const status: GameHistoryView["status"] = !username || !loaded ? "loading" : failed ? "unavailable" : "ready";
  return { status, games, loadingMore, hasMore, loadMore };
};
