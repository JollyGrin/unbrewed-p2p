/**
 * Which way the board is drawn. Two presentations of ONE game state — the
 * socket, the rules, every handler and every prompt are identical; only the
 * rendering differs.
 *
 *  - `flat`  the original straight-on board (ProBoard). Unchanged, and the
 *            default, so nobody's game is altered by this feature existing.
 *  - `table` the tabletop view: the same map tilted away from the camera with
 *            the fighters standing upright on it (see tableProjection.ts).
 *
 * Kept as its own module, in the shape of `pace.ts`, so the pure vocabulary
 * can be imported by tests and by the projection layer without dragging in a
 * React hook.
 */
export type BoardView = "flat" | "table";

export const BOARD_VIEWS: BoardView[] = ["flat", "table"];

/** The straight-on board stays the default: opting IN is the player's choice. */
export const DEFAULT_BOARD_VIEW: BoardView = "flat";

export const isBoardView = (value: string): value is BoardView =>
  (BOARD_VIEWS as string[]).includes(value);

export const BOARD_VIEW_LABEL: Record<BoardView, string> = {
  flat: "Flat board",
  table: "Tabletop",
};

export const nextBoardView = (current: BoardView): BoardView =>
  current === "flat" ? "table" : "flat";
