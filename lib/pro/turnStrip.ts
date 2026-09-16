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

/**
 * Whether moving from `prev` to `next` is a real hand-over of the turn to this
 * seat, worth a "Your turn" cue. Views arrive as paced snapshot batches (and an
 * accepted undo rewinds through them), so "it is my turn now" alone is not
 * enough: the previous view must have been someone else's turn, and the turn
 * number must not have gone backwards.
 */
export function yourTurnCueDue(prev: PlayerView | null, next: PlayerView): boolean {
  if (!prev || next.phase !== "PLAY" || next.winner) return false;
  return next.activePlayer === next.you && prev.activePlayer !== prev.you && next.turnNumber >= prev.turnNumber;
}

/** Whether `next` is the moment a combat starts asking this seat to defend. */
export function defenseCueDue(prev: PlayerView | null, next: PlayerView): boolean {
  const asking = (v: PlayerView | null) => v?.combat?.stage === "COMMIT_DEFENSE" && v.combat.defenderPlayer === v.you;
  return !!prev && asking(next) && !asking(prev);
}
