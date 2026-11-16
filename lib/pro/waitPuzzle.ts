/**
 * A puzzle while you wait (issue #1681): the small decisions shared by the two
 * waits on `/pro/game` — a Quick Play search and a created lobby.
 *
 * - whether the viewport has room for the panel (`useWaitPuzzleFits`),
 * - the visitor's "Hide puzzles while waiting" switch (`useWaitPuzzleHidden`),
 * - how long a lobby holds the table back once the opponent is in
 *   (`lobbyHoldMs`), so a click in progress on the puzzle is not hijacked.
 */
import { useCallback, useEffect, useState } from "react";

/** "1" = the visitor switched the waiting puzzle off. Absent = on. */
export const WAIT_PUZZLE_HIDDEN_KEY = "unbrewed-pro-wait-puzzles-hidden";
const CHANGE_EVENT = "unbrewed-pro-wait-puzzles-hidden-change";

export type WaitPuzzlePlace = "quick" | "lobby";

/**
 * The smallest viewport the waiting puzzle is shown in, per place. Anything
 * smaller (every phone, a small landscape tablet, a short laptop window) keeps
 * today's waiting screens.
 *
 * - `lobby`: the panel has the whole screen under one bar. Width: Chakra `lg`.
 * - `quick`: the panel takes the roster's column of the picker, under the
 *   rules strip, the ribbon and the search bar, beside the 20rem setup rail.
 *   That leaves it about (height - 270) px, so it needs a taller viewport.
 */
export const WAIT_PUZZLE_MIN: Record<WaitPuzzlePlace, { width: number; height: number }> = {
  lobby: { width: 992, height: 640 },
  quick: { width: 1100, height: 700 },
};
export const waitPuzzleMedia = (place: WaitPuzzlePlace): string =>
  `(min-width: ${WAIT_PUZZLE_MIN[place].width}px) and (min-height: ${WAIT_PUZZLE_MIN[place].height}px)`;

/** True once the viewport is known to be big enough. False on the server and on the first paint. */
export const useWaitPuzzleFits = (place: WaitPuzzlePlace): boolean => {
  const [fits, setFits] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia(waitPuzzleMedia(place));
    const sync = () => setFits(query.matches);
    sync();
    query.addEventListener?.("change", sync);
    return () => query.removeEventListener?.("change", sync);
  }, [place]);
  return fits;
};

const readHidden = (): boolean => {
  try {
    return window.localStorage.getItem(WAIT_PUZZLE_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
};

/**
 * The "Hide puzzles while waiting" switch. Kept in localStorage, so it holds
 * for later visits too; with storage blocked it holds for this page.
 * `known` is false until the stored value has been read (never on the server).
 */
export const useWaitPuzzleHidden = (): { hidden: boolean; known: boolean; setHidden: (hidden: boolean) => void } => {
  const [hidden, setHiddenState] = useState(false);
  const [known, setKnown] = useState(false);
  useEffect(() => {
    const sync = () => setHiddenState(readHidden());
    sync();
    setKnown(true);
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const setHidden = useCallback((next: boolean) => {
    setHiddenState(next);
    try {
      if (next) window.localStorage.setItem(WAIT_PUZZLE_HIDDEN_KEY, "1");
      else window.localStorage.removeItem(WAIT_PUZZLE_HIDDEN_KEY);
      window.dispatchEvent(new Event(CHANGE_EVENT));
    } catch {
      /* storage blocked: the choice holds for this page */
    }
  }, []);
  return { hidden, known, setHidden };
};

/** The lobby's hold, same length as Quick Play's "Match found" countdown. */
export const LOBBY_HOLD_MS = 3_000;
/** The hold in a room on a short move timer. */
export const LOBBY_HOLD_SHORT_MS = 1_500;
/** A move timer under this many seconds gets the short hold. */
export const LOBBY_HOLD_SHORT_UNDER_SECONDS = 30;

/**
 * How long a lobby keeps the puzzle up (paused, behind the gold bar) after the
 * game has started. The game is already running on the server while we hold:
 * the opening mulligan or the first decision is on the clock in a timed room.
 * Three seconds is what Quick Play has always spent on its 60 s timer; a room on
 * a short timer (10–29 s) gets half of that, which still lets a click that was
 * in flight land on the paused panel instead of on the table.
 */
export const lobbyHoldMs = (turnTimerSeconds: number | undefined | null): number =>
  turnTimerSeconds && turnTimerSeconds > 0 && turnTimerSeconds < LOBBY_HOLD_SHORT_UNDER_SECONDS ? LOBBY_HOLD_SHORT_MS : LOBBY_HOLD_MS;
