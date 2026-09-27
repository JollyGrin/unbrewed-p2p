/**
 * The leaderboard board for the dashboard's window, with one fallback: an api
 * that predates contract §2c can't answer `window=month` (the client reports
 * it `unavailable` rather than print all-time numbers under a month heading).
 * The page is still useful then, so it asks for the all-time board instead and
 * says so — `shownWindow` is the window the rows actually belong to.
 */
import { useEffect, useState } from "react";

import { fetchStatsLeaderboard } from "@/lib/stats/client";
import { DASHBOARD_BOARD_LIMIT } from "@/lib/stats/leaderboardDashboard";
import type { StatsLeaderboard, StatsWindow } from "@/lib/stats/types";

export interface DashboardBoard {
  status: "loading" | "unavailable" | "ready";
  board: StatsLeaderboard | null;
  shownWindow: StatsWindow;
}

export const useDashboardBoard = (window: StatsWindow): DashboardBoard => {
  const [view, setView] = useState<DashboardBoard>({ status: "loading", board: null, shownWindow: window });

  useEffect(() => {
    setView({ status: "loading", board: null, shownWindow: window });
    let alive = true;
    void (async () => {
      let shown = window;
      let result = await fetchStatsLeaderboard({ limit: DASHBOARD_BOARD_LIMIT, window });
      if (!result.ok && window === "month") {
        shown = "all";
        result = await fetchStatsLeaderboard({ limit: DASHBOARD_BOARD_LIMIT, window: "all" });
      }
      if (!alive) return;
      setView(
        result.ok
          ? { status: "ready", board: result.value, shownWindow: shown }
          : { status: "unavailable", board: null, shownWindow: window },
      );
    })();
    return () => {
      alive = false;
    };
  }, [window]);

  return view;
};
