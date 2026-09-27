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

/**
 * The view actually drawn, given the stored preference, the layout (#870) and
 * the current map (#911). The tabletop board is built for an unrotated frame
 * — its tilt, standees and badges have no counter-rotation — so a portrait
 * phone, whose board frame is turned 90°, always gets the flat board. A map
 * with a region (Baba Yaga's Hut) falls back the same way: a region's spaces
 * are normalized to their own inset image, which the tabletop view can't
 * place (see TableBoard.tsx). Either way the stored preference is left
 * alone — leaving portrait, or reaching a map without a region, returns the
 * tabletop on its own.
 */
export const resolveBoardView = (preferred: BoardView, layoutMode: string, hasRegions = false): BoardView =>
  layoutMode === "portrait" || hasRegions ? "flat" : preferred;

/** Why the Board toggle is unavailable in portrait (#870). */
export const TABLETOP_NEEDS_LANDSCAPE = "Tabletop needs landscape";
