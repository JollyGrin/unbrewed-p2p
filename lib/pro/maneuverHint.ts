import type { Action, PlayerView } from "./protocol";

/**
 * One-line explanation of the boost affordance during your own MANEUVER_MOVE
 * (issue #85: boost options vanish without explanation once they no longer
 * apply, which reads as "boost randomly doesn't show"). Derived ONLY from
 * server-sent state (view.maneuver, view.fighters) and what the server offered
 * (legalActions) — the client still encodes zero rules.
 */
export function maneuverBoostHint(view: PlayerView, legalActions: Action[]): string | null {
  const m = view.maneuver;
  if (view.turnPhase !== "MANEUVER_MOVE" || !m || view.activePlayer !== view.you) return null;

  if (m.boosted) return `move boosted +${m.boostApplied} this maneuver`;
  if (legalActions.some((a) => a.type === "BOOST_MOVE")) {
    return "tip: discard a card from your hand to boost this move";
  }

  // No boost offered and none applied. Say why, using only the server's
  // moved-list: either every fighter has spent its move, or the hand simply
  // has no boostable card.
  const mine = view.fighters.filter((f) => f.owner === view.you && !f.defeated && f.space !== null);
  const moved = mine.filter((f) => m.moved.includes(f.id));
  if (mine.length > 0 && moved.length === mine.length) {
    return mine.length === 1
      ? `${mine[0].name} already moved — boost is no longer available this maneuver`
      : "all your fighters have moved — boost is no longer available this maneuver";
  }
  return "no boostable cards in hand";
}
