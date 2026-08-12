/**
 * Paged game history — the signed-in player's for /account (issue #573), and
 * any player's for /stats (issue #590).
 *
 * Unlike the `/me` probe and the cloud bag this keeps its state in the
 * component, not in a module store: history is paginated and exists on exactly
 * one page at a time, so there is no second consumer to share with, and a
 * remount should genuinely refetch rather than resurrect a half-walked cursor.
 *
 * Two invariants the tests pin:
 *
 * 1. **A guest costs nothing.** Nothing fetches until the account probe has
 *    said "signed-in", so a signed-out visit to /account makes zero requests
 *    beyond the single `/me` that already existed. (The public hook has no such
 *    gate — it IS the page's reason for existing — but it still waits for a
 *    username rather than firing on an empty query string.)
 * 2. **No retry.** A failed page is a calm empty state, not a spinner that
 *    keeps hammering an API that is very often simply not deployed.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AccountGame,
  AccountGamesPage,
  fetchAccountGames,
  GAMES_PAGE_SIZE,
  HistoryResult,
} from "./gameHistory";
import { fetchPublicGames } from "./publicProfile";
import { useAccount } from "./useAccount";

/**
 * What the games list should show:
 * - `loading`     — the account probe or the first page is in flight
 * - `guest`       — API reachable, nobody signed in → offer sign-in
 * - `offline`     — the accounts API itself is unreachable
 * - `unavailable` — history didn't come back (503, upstream down, an expired
 *                   cookie mid-session) → friendly empty state
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

/** Fetch one page of somebody's history, from an opaque cursor. */
type PageLoader = (
  before: string | null,
) => Promise<HistoryResult<AccountGamesPage>>;

interface PagedGames {
  games: AccountGame[];
  loadingMore: boolean;
  hasMore: boolean;
  loadMore: () => void;
  /** The first page has settled, one way or the other. */
  loaded: boolean;
  /** The first page came back as a failure. */
  failed: boolean;
}

/**
 * The cursor walk itself, with no opinion about WHOSE history it is.
 *
 * `key` is the subject — `"me"`, or a username — and is the only thing the
 * effect depends on: a null key means "don't ask yet" and resets the list, and
 * a changed key starts a clean first page rather than appending one player's
 * games to another's. `load` is held in a ref so a caller can pass an inline
 * closure without re-firing the first page on every render.
 */
const usePagedGames = (key: string | null, load: PageLoader): PagedGames => {
  const [games, setGames] = useState<AccountGame[]>([]);
  const [before, setBefore] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // One in-flight request at a time: a double-clicked "Load more" must not
  // fetch the same cursor twice and duplicate a page into the list.
  const inFlight = useRef(false);
  const loader = useRef(load);
  loader.current = load;

  useEffect(() => {
    if (!key) {
      // Sign-out, or a page still waiting for its `?u=`: drop the list so a
      // later subject starts from a clean first page.
      setGames([]);
      setBefore(null);
      setFailed(false);
      setLoaded(false);
      return;
    }
    let alive = true;
    inFlight.current = true;
    setGames([]);
    setBefore(null);
    setFailed(false);
    setLoaded(false);
    void loader.current(null).then((result) => {
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
  }, [key]);

  const loadMore = useCallback(() => {
    if (!key || !before || inFlight.current) return;
    inFlight.current = true;
    setLoadingMore(true);
    void loader.current(before).then((result) => {
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
  }, [before, key]);

  return {
    games,
    loadingMore,
    hasMore: before !== null,
    loadMore,
    loaded,
    failed,
  };
};

export const useGameHistory = (): GameHistoryView => {
  const { status: accountStatus } = useAccount();
  const signedIn = accountStatus === "signed-in";
  const { games, loadingMore, hasMore, loadMore, loaded, failed } =
    usePagedGames(signedIn ? "me" : null, (before) =>
      fetchAccountGames({ limit: GAMES_PAGE_SIZE, before }),
    );

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

  return { status, games, loadingMore, hasMore, loadMore };
};

/**
 * Any player's history, for the public profile page (#590).
 *
 * No account probe in the way: this reads a public route, so a signed-out
 * visitor gets the full list. `null` (the page hasn't read `?u=` yet) simply
 * stays on `loading` — there is no guest state for somebody else's shelf.
 */
export const usePublicGameHistory = (
  username: string | null,
): GameHistoryView => {
  const { games, loadingMore, hasMore, loadMore, loaded, failed } =
    usePagedGames(username, (before) =>
      fetchPublicGames(username ?? "", { limit: GAMES_PAGE_SIZE, before }),
    );

  const status: GameHistoryStatus = !username
    ? "loading"
    : !loaded
      ? "loading"
      : failed
        ? "unavailable"
        : "ready";

  return { status, games, loadingMore, hasMore, loadMore };
};
