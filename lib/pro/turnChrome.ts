/** Live-turn chrome visibility for the Pro side panel (issue #194). */
import { adventureTurnLabel } from "./adventureBoard";
import type { PlayerView } from "./protocol";

/**
 * Whether the side panel should show LIVE-turn chrome (whose-turn / turn-N /
 * actions-left chips and the "waiting on…" banner). False once a winner is set:
 * at GAME_OVER legal actions are always empty and no seat is on turn, so those
 * elements would go stale ("P2'S TURN · 1 actions left" above a VICTORY!). Holds
 * for duel and multiplayer alike — `winner` is set the same way regardless of
 * seat count. The panel shows the outcome (VICTORY!/DEFEAT) instead.
 */
export function showLiveTurnChrome(view: PlayerView): boolean {
  return !view.winner;
}

/**
 * Whether the engine is waiting on THIS seat for a decision right now: an
 * action on offer, or a prompt this seat is the one choosing (the other seat
 * sees a redacted summary of it with `options: []`). The inverse is the
 * dock's "waiting on opponent…" line, and the turn reminder (issue #875) uses
 * the same test, because "it's my turn" is not enough: inside this seat's own
 * turn the game can be waiting on the opponent's defense or an opponent-owned
 * prompt.
 */
export function seatOwesDecision(view: PlayerView, legalActionCount: number): boolean {
  if (legalActionCount > 0) return true;
  const prompt = view.prompt;
  return !!prompt && prompt.player === view.you && prompt.options.length > 0;
}

/**
 * The dock's turn chip text ("YOUR TURN" / "OPPONENT'S TURN" / "P3'S TURN"). A view with an
 * initiative row uses the turn banner's own label so the chip and banner name the same mover.
 */
export function dockTurnLabel(view: PlayerView, myTurn: boolean, seatPossessive: string): string {
  const banner = adventureTurnLabel(view);
  if (banner) return banner.text;
  return myTurn ? "YOUR TURN" : `${seatPossessive.toUpperCase()} TURN`;
}
