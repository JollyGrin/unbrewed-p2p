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
