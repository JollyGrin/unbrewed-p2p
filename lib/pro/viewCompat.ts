/** Duel-compat helpers for protocol v13 views. */
import type { PlayerView, ViewOpponent } from "./protocol";

export function requireOpponent(view: PlayerView): ViewOpponent {
  if (!view.opponent) throw new Error("Expected a duel opponent in this Pro view");
  return view.opponent;
}
