/**
 * The portrait turn strip under the HP chips (mobile step 2): whose turn it is,
 * which turn, and how many actions are left — the facts the old pill row and
 * the "waiting on opponent…" pill used to carry on top of the board.
 */
import type { PlayerId, PlayerView } from "./protocol";
import { showLiveTurnChrome } from "./turnChrome";

export interface TurnStrip {
  tone: "mine" | "theirs" | "setup";
  label: string;
  /** remaining actions, drawn as pips; 0 when it is not this seat's turn */
  pips: number;
}

export function turnStripFor(view: PlayerView, nameOf: (id: PlayerId) => string): TurnStrip | null {
  if (!showLiveTurnChrome(view)) return null;
  if (view.phase === "SETUP") return { tone: "setup", label: "SETUP", pips: 0 };
  if (view.activePlayer === view.you)
    return { tone: "mine", label: `YOUR TURN · TURN ${view.turnNumber}`, pips: Math.max(view.actionsRemaining, 0) };
  return { tone: "theirs", label: `${nameOf(view.activePlayer).toUpperCase()}'S TURN…`, pips: 0 };
}
