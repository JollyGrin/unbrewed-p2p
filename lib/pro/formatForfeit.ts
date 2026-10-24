/**
 * What forfeiting does, per format (p2p #1474, delta review M4) — the `ForfeitDialog` body, in
 * the `formatUndo` / `FormatEndScreen` registry style so the page carries no format branch.
 *
 * Only what the client can know: whether an adventure forfeit ends the game is the engine's
 * "last hero out" call (turn.ts applyMultiplayerForfeit), which turns on whether a seat's figures
 * were ever on the board — not in the view — so the adventure copy states the rule rather than
 * predicting the outcome. A format id this client does not know, or none (an older server, a
 * fixture), reads the shape off the view: a scenario game, more than two seats, else a duel.
 */
import type { PlayerView } from "./protocol";

export const DUEL_FORFEIT_COPY = "Your opponent wins. This cannot be undone.";
export const MULTIPLAYER_FORFEIT_COPY =
  "You resign your seat and its fighters are removed. If the match continues without you, you can keep watching. This cannot be undone.";
export const ADVENTURE_FORFEIT_COPY =
  "Forfeiting removes your fighters from the table; the game continues if any other hero can still play. This cannot be undone.";

const FORFEIT_COPY: Record<string, string> = {
  duel: DUEL_FORFEIT_COPY,
  "ffa-3": MULTIPLAYER_FORFEIT_COPY,
  "team-2v2": MULTIPLAYER_FORFEIT_COPY,
  adventure: ADVENTURE_FORFEIT_COPY,
};

export const formatForfeitCopy = (
  formatId: string | null | undefined,
  view: Pick<PlayerView, "players" | "scenario">,
): string => {
  if (formatId && formatId in FORFEIT_COPY) return FORFEIT_COPY[formatId]!;
  if (view.scenario) return ADVENTURE_FORFEIT_COPY;
  return (view.players?.length ?? 0) > 2 ? MULTIPLAYER_FORFEIT_COPY : DUEL_FORFEIT_COPY;
};
