/**
 * Quick Match (issue #687 ↔ engine #391) — one button that puts you in a game.
 *
 * There is no queue and no rating: Quick Match is pure UX over the public-lobby
 * list the pre-join picker already polls (`LIST_LOBBIES` every 5s). The whole
 * decision is "join the person who has been waiting longest, or open a room and
 * wait myself", and this module is that decision as pure functions so the page
 * only has to drive it.
 *
 * The interesting part is the RACE. Between the poll that listed a lobby and our
 * `JOIN_ROOM` reaching the server, someone else may have taken the seat (or the
 * host may have walked away) — the server answers `ROOM_FULL` / `ROOM_NOT_FOUND`.
 * That is an ordinary outcome of matchmaking, not an error to show anyone, so the
 * search walks to the next candidate and only creates a room once the list is
 * exhausted. `advance` is what the page calls when a join comes back retryable.
 *
 * Protocol skew: `LobbyListing.formatId` is optional and absent on the currently
 * deployed engine, where every listed room IS a duel — hence `?? "duel"` rather
 * than a presence check. Same story for `host` / `turnTimerSeconds` in the strip.
 */
import type { BotDifficulty, LobbyListing } from "./protocol";

/**
 * Join failures that mean "that lobby is gone" — the seat filled or the room
 * closed between the poll and our join. Every other error is a real error and
 * stops the search (the page renders it as it always has).
 */
const RETRYABLE_JOIN_ERRORS: ReadonlySet<string> = new Set(["ROOM_FULL", "ROOM_NOT_FOUND"]);

export const isQuickMatchRetryable = (code: string | null | undefined): boolean =>
  !!code && RETRYABLE_JOIN_ERRORS.has(code);

/** v1 matches duels only. A listing with no `formatId` is a duel (see above). */
export const isQuickMatchCandidate = (lobby: LobbyListing): boolean =>
  (lobby.formatId ?? "duel") === "duel";

/**
 * The rooms Quick Match will try, longest-waiting first.
 *
 * The server already sorts oldest-first, but we re-sort on `ageMs` anyway: the
 * ordering is the entire product promise here ("the person who has waited
 * longest gets the next opponent") and it costs nothing to not depend on it.
 * `exclude` keeps our own room out once we are the one waiting.
 */
export const quickMatchCandidates = (
  lobbies: LobbyListing[] | null | undefined,
  exclude: readonly string[] = [],
): string[] => {
  const skip = new Set(exclude);
  const seen = new Set<string>();
  return (lobbies ?? [])
    .filter(isQuickMatchCandidate)
    .slice()
    .sort((a, b) => b.ageMs - a.ageMs)
    .map((l) => l.roomId)
    .filter((roomId) => {
      if (skip.has(roomId) || seen.has(roomId)) return false;
      seen.add(roomId);
      return true;
    });
};

/** A Quick Match in flight: the hero we committed, and how far down the list we are. */
export interface QuickMatchSearch {
  heroId: string;
  candidates: string[];
  /** index into `candidates`; `>= candidates.length` means "create instead" */
  index: number;
}

export type QuickMatchStep =
  | { type: "join"; roomId: string }
  | { type: "create" };

export const startQuickMatch = (
  heroId: string,
  lobbies: LobbyListing[] | null | undefined,
  exclude: readonly string[] = [],
): QuickMatchSearch => ({ heroId, candidates: quickMatchCandidates(lobbies, exclude), index: 0 });

/** What to do right now: try the next listed lobby, or open our own room. */
export const quickMatchStep = (search: QuickMatchSearch): QuickMatchStep => {
  const roomId = search.candidates[search.index];
  return roomId ? { type: "join", roomId } : { type: "create" };
};

/** That candidate is gone — move to the next one (or off the end, i.e. create). */
export const advanceQuickMatch = (search: QuickMatchSearch): QuickMatchSearch => ({
  ...search,
  index: search.index + 1,
});

/** True once the search has run out of lobbies and is opening/holding its own room. */
export const isQuickMatchWaiting = (search: QuickMatchSearch): boolean =>
  search.index >= search.candidates.length;

/**
 * How many OTHER duel lobbies are open right now — the live "who else is out
 * there" number on the waiting screen. Our own room is listed too once it goes
 * public, so it is always excluded.
 */
export const openLobbyCount = (
  lobbies: LobbyListing[] | null | undefined,
  ownRoomId?: string | null,
): number =>
  (lobbies ?? []).filter((l) => isQuickMatchCandidate(l) && l.roomId !== ownRoomId).length;

/** Copy for that number. Zero is the common case and must not read as an error. */
export const waitingCountLabel = (count: number): string =>
  count === 0
    ? "no one else is searching right now — you're first in line"
    : count === 1
      ? "1 other player is waiting for a match"
      : `${count} other players are waiting for a match`;

/**
 * "Play a bot instead" is drop-and-create: there is no engine support for adding
 * a bot to a live room, so we LEAVE (a full navigation closes the socket, which
 * the server reads as the host walking away) and land back on the picker with the
 * existing `?vs=ai-*` preset armed and our hero already chosen. `?quick` is
 * deliberately dropped — we are no longer searching.
 */
export const botFallbackHref = (
  heroId: string,
  difficulty: BotDifficulty,
  opts: { debug?: boolean } = {},
): string =>
  `/pro/game?vs=ai-${difficulty}&hero=${encodeURIComponent(heroId)}${opts.debug ? "&debug=1" : ""}`;

/** Enriched-listing helpers for the lobby strip. All tolerate absent fields. */
export const lobbyHostName = (lobby: LobbyListing): string | null =>
  lobby.host?.displayName?.trim() || null;

export const lobbyTimerLabel = (lobby: LobbyListing): string | null =>
  lobby.turnTimerSeconds && lobby.turnTimerSeconds > 0 ? `⏱ ${lobby.turnTimerSeconds}s` : null;
