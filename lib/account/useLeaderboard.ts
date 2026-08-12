/**
 * The public leaderboard for /leaderboard (issue #590).
 *
 * One `GET /leaderboard` per mount, no retry, no session — the board is cached
 * server-side for minutes at a time, so a client-side refresh loop would buy
 * nothing but requests. A board that didn't arrive is a quiet sentence, the
 * same as everywhere else in lib/account.
 */
import { useEffect, useState } from "react";

import { fetchLeaderboard, Leaderboard, LEADERBOARD_LIMIT } from "./leaderboard";

/**
 * - `loading`     — the request is in flight
 * - `unavailable` — the API is unreachable, or wouldn't answer
 * - `ready`       — a board in hand (possibly empty, on a fresh deploy)
 */
export type LeaderboardStatus = "loading" | "unavailable" | "ready";

export interface LeaderboardView {
  status: LeaderboardStatus;
  board: Leaderboard | null;
}

export const useLeaderboard = (
  limit: number = LEADERBOARD_LIMIT,
): LeaderboardView => {
  const [view, setView] = useState<LeaderboardView>({
    status: "loading",
    board: null,
  });

  useEffect(() => {
    let alive = true;
    void fetchLeaderboard(limit).then((result) => {
      if (!alive) return;
      setView(
        result.ok
          ? { status: "ready", board: result.value }
          : { status: "unavailable", board: null },
      );
    });
    return () => {
      alive = false;
    };
  }, [limit]);

  return view;
};
