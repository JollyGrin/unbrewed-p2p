/**
 * The signed-in player's stats for /account (issue #574).
 *
 * The same two invariants useGameHistory pins, for the same reasons:
 *
 * 1. **A guest costs nothing.** Nothing fetches until the account probe says
 *    "signed-in", so the page still makes exactly one request for a guest.
 * 2. **No retry.** One `GET /me/stats` per mount, and a failure is a quiet
 *    state — the API is optional infrastructure, and 503 is its normal answer
 *    on a build with no telemetry link.
 *
 * Component state rather than a module store, like the history: there is one
 * consumer on one page, and a remount should genuinely re-ask.
 */
import { useEffect, useState } from "react";

import { AccountStats, fetchAccountStats } from "./stats";
import { useAccount } from "./useAccount";

/**
 * - `loading`     — the account probe or the stats request is in flight
 * - `guest`       — nobody signed in (the page renders its own prompt)
 * - `offline`     — the accounts API itself is unreachable
 * - `unavailable` — signed in, but stats didn't come back → quiet state
 * - `ready`       — an aggregate in hand (possibly of zero games)
 */
export type AccountStatsStatus =
  | "loading"
  | "guest"
  | "offline"
  | "unavailable"
  | "ready";

export interface AccountStatsView {
  status: AccountStatsStatus;
  stats: AccountStats | null;
}

export const useAccountStats = (): AccountStatsView => {
  const { status: accountStatus } = useAccount();
  const [stats, setStats] = useState<AccountStats | null>(null);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const signedIn = accountStatus === "signed-in";

  useEffect(() => {
    if (!signedIn) {
      // Signing out drops the numbers rather than showing the previous
      // account's record behind a sign-in prompt.
      setStats(null);
      setFailed(false);
      setLoaded(false);
      return;
    }
    let alive = true;
    void fetchAccountStats().then((result) => {
      if (!alive) return;
      if (!result.ok) {
        setFailed(true);
        setLoaded(true);
        return;
      }
      setStats(result.value);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [signedIn]);

  const status: AccountStatsStatus =
    accountStatus === "guest"
      ? "guest"
      : accountStatus === "offline"
        ? "offline"
        : accountStatus === "loading" || !loaded
          ? "loading"
          : failed || !stats
            ? "unavailable"
            : "ready";

  return { status, stats };
};
