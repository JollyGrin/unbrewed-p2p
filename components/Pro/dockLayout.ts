/** Geometry of the fixed desktop Actions dock, shared so overlays can stay clear of it. */
export const DOCK_WIDTH = "18.5rem";
export const DOCK_RIGHT = "0.75rem";
export const DOCK_TOP = "7.5rem";

/** Width of the Adventure overlay column (AdventureBoard maxW), docked left of the dock. */
export const ADVENTURE_BOARD_WIDTH = "17rem";
/** HudOverlay's own right inset (header.styles). */
export const HUD_OVERLAY_INSET = "0.6rem";
/**
 * Right padding for the seat-plate row when an Adventure overlay is present: the plates
 * wrap short of the overlay column (#1135) instead of running underneath it. Measured
 * from the HudOverlay's content edge, so it adds the dock + overlay + a 0.75rem gap and
 * subtracts the overlay's own inset.
 */
export const ADVENTURE_PLATE_PAD_RIGHT = `calc(${DOCK_RIGHT} + ${DOCK_WIDTH} + 0.75rem + ${ADVENTURE_BOARD_WIDTH} + 0.75rem - ${HUD_OVERLAY_INSET})`;

/**
 * #1138: Adventure seat plates are always COMPACT (the collapsed title bar: name + HP,
 * full detail in the hover peek), never the 15rem full plate. #1137 let full plates wrap
 * into a second row, which covered board spaces and swallowed clicks; and even one row
 * of full plates is ~9.6rem tall, which dips under the board (it starts at DOCK_TOP) and
 * covers its top spaces at 1920. A compact plate is 10rem wide, so 4 heroes + the enemy
 * plate fit one row left of the overlay column from ~1450px up, and its height is capped
 * to the strip above the board.
 */
export const COMPACT_PLATE_WIDTH_REM = 10;
export const COMPACT_PLATE_MAX_HEIGHT_REM = 6.5;
