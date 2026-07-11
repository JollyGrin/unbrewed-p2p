/** Live-turn chrome visibility for the Pro side panel (issue #194). */
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
