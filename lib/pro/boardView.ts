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

/** The slice of a map the board view depends on (a `ProMapDef` fits). */
export type BoardViewMap = { regions?: readonly unknown[] };

/**
 * Whether the map has a region (today: only Baba Yaga's Hut). A region's
 * spaces are normalized to their OWN inset image, not the main board — the
 * tabletop view renders `mainSpaces` in 3D and floats the region as its own
 * 2D inset panel over that frame (unbrewed-p2p#922's hybrid), so a caller
 * that needs to tell region spaces apart from main-board ones (`TableBoard`)
 * still reaches for this.
 */
export const mapHasRegions = (map: BoardViewMap | null | undefined): boolean => (map?.regions?.length ?? 0) > 0;

/**
 * The view actually drawn, given the stored preference and the layout (#870).
 * The tabletop board is built for an unrotated frame — its tilt, standees and
 * badges have no counter-rotation — so a portrait phone, whose board frame is
 * turned 90°, always gets the flat board. A map with a region no longer
 * forces the flat board (#922): the tabletop renders its main spaces in 3D
 * and floats the region as the same 2D inset panel the flat board uses. The
 * stored preference is left alone either way: turning the phone back to
 * landscape returns to the tabletop.
 */
export const resolveBoardView = (preferred: BoardView, layoutMode: string): BoardView =>
  layoutMode === "portrait" ? "flat" : preferred;

/** Why the Board toggle is unavailable in portrait (#870). */
export const TABLETOP_NEEDS_LANDSCAPE = "Tabletop needs landscape";

/**
 * Why the Board toggle cannot switch views right now, or undefined when it
 * can. Switching while locked would rewrite the stored preference with
 * nothing changing on screen, so the toggle renders disabled with this hint.
 */
export const boardViewLockedHint = (layoutMode: string): string | undefined =>
  layoutMode === "portrait" ? TABLETOP_NEEDS_LANDSCAPE : undefined;
