/**
 * The signed-in player's game history for /account (issue #573).
 *
 * Unlike the `/me` probe and the cloud bag this keeps its state in the
 * component, not in a module store: history is paginated and exists on exactly
 * one page, so there is no second consumer to share with, and a remount should
 * genuinely refetch rather than resurrect a half-walked cursor.
 *
 * Two invariants the tests pin:
 *
 * 1. **A guest costs nothing.** Nothing fetches until the account probe has
 *    said "signed-in", so a signed-out visit to /account makes zero requests
 *    beyond the single `/me` that already existed.
 * 2. **No retry.** A failed page is a calm empty state, not a spinner that
 *    keeps hammering an API that is very often simply not deployed.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AccountGame,
  fetchAccountGames,
  GAMES_PAGE_SIZE,
} from "./gameHistory";
import { useAccount } from "./useAccount";

/**
 * What the games list should show:
 * - `loading`     — the account probe or the first page is in flight
 * - `guest`       — API reachable, nobody signed in → offer sign-in
 * - `offline`     — the accounts API itself is unreachable
 * - `unavailable` — signed in, but history didn't come back (503, upstream
 *                   down, an expired cookie mid-session) → friendly empty state
 * - `ready`       — first page in hand (possibly zero games)
 */
export type GameHistoryStatus =
  | "loading"
  | "guest"
  | "offline"
  | "unavailable"
  | "ready";

export interface GameHistoryView {
  status: GameHistoryStatus;
  games: AccountGame[];
  /** True while a "Load more" page is in flight. */
  loadingMore: boolean;
  /** Whether the API handed back a cursor for an older page. */
  hasMore: boolean;
  loadMore: () => void;
}

export const useGameHistory = (): GameHistoryView => {
  const { status: accountStatus } = useAccount();
  const [games, setGames] = useState<AccountGame[]>([]);
  const [before, setBefore] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // One in-flight request at a time: a double-clicked "Load more" must not
  // fetch the same cursor twice and duplicate a page into the list.
  const inFlight = useRef(false);

  const signedIn = accountStatus === "signed-in";

  useEffect(() => {
    if (!signedIn) {
      // Sign-out (or a probe that never said signed-in) drops the list, so a
      // later sign-in starts from a clean first page.
      setGames([]);
      setBefore(null);
      setFailed(false);
      setLoaded(false);
      return;
    }
    let alive = true;
    inFlight.current = true;
    void fetchAccountGames({ limit: GAMES_PAGE_SIZE }).then((result) => {
      inFlight.current = false;
      if (!alive) return;
      if (!result.ok) {
        setFailed(true);
        setLoaded(true);
        return;
      }
      setGames(result.value.games);
      setBefore(result.value.nextBefore);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [signedIn]);

  const loadMore = useCallback(() => {
    if (!signedIn || !before || inFlight.current) return;
    inFlight.current = true;
    setLoadingMore(true);
    void fetchAccountGames({ limit: GAMES_PAGE_SIZE, before }).then((result) => {
      inFlight.current = false;
      setLoadingMore(false);
      if (!result.ok) {
        // Keep what we already have and stop offering more: a page that didn't
        // arrive is not worth an error banner over a list that still reads.
        setBefore(null);
        return;
      }
      setGames((current) => {
        const seen = new Set(current.map((game) => game.id));
        return [
          ...current,
          ...result.value.games.filter((game) => !seen.has(game.id)),
        ];
      });
      setBefore(result.value.nextBefore);
    });
  }, [before, signedIn]);

  const status: GameHistoryStatus =
    accountStatus === "guest"
      ? "guest"
      : accountStatus === "offline"
        ? "offline"
        : accountStatus === "loading" || !loaded
          ? "loading"
          : failed
            ? "unavailable"
            : "ready";

  return { status, games, loadingMore, hasMore: before !== null, loadMore };
};
