/**
 * Which formats can ever offer Undo (p2p #1473, delta review H1). A format registry in the
 * `FormatOverlay` / `FormatEndScreen` style: the dock renders the Undo control only where the
 * format can offer it, so a seat in ffa-3 / team-2v2 never stares at a permanently greyed
 * "Undo isn't available right now".
 *
 * Mirrors the engine's own rule (server/rooms.ts): undo needs exactly two seats (duel, by
 * consent) unless an engine-played seat is at the table (adventure, the solo rule). A format id
 * this client does not know — or none at all, an older server / a fixture that sends no
 * `formatId` — falls back to that same shape read off the view: two seats, or a scenario game.
 * Client rule only: a server-projected `undoSupported` would replace this registry outright.
 */
import type { PlayerView } from "./protocol";

const UNDO_FORMATS: Record<string, boolean> = {
  duel: true,
  adventure: true,
  "ffa-3": false,
  "team-2v2": false,
};

export const formatSupportsUndo = (
  formatId: string | null | undefined,
  view: Pick<PlayerView, "players" | "scenario">,
): boolean => {
  if (formatId && formatId in UNDO_FORMATS) return UNDO_FORMATS[formatId]!;
  return (view.players?.length ?? 0) === 2 || !!view.scenario;
};
