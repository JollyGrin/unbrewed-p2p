/** Geometry of the fixed desktop Actions dock, shared so overlays can stay clear of it. */
export const DOCK_WIDTH = "18.5rem";
export const DOCK_RIGHT = "0.75rem";
export const DOCK_TOP = "7.5rem";

/** Width of the Adventure overlay column (AdventureBoard maxW), docked left of the dock. */
export const ADVENTURE_BOARD_WIDTH = "17rem";
/** Column top, under the chip cluster. */
export const ADVENTURE_BOARD_TOP = "3.2rem";
/**
 * #1178: the desktop hand fan (game.tsx: 8.5rem cards, 63:88, bottom -0.75rem, hover lift
 * 1.25rem) tops out ~15rem above the viewport bottom. The column ends above that, so the
 * narrator and PLAYERS CHOOSE panels are never under the fan.
 */
export const HAND_FAN_RESERVE_REM = 15;
export const ADVENTURE_BOARD_MAX_HEIGHT = `calc(100vh - ${ADVENTURE_BOARD_TOP} - ${HAND_FAN_RESERVE_REM}rem)`;
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
export const COMPACT_PLATE_MAX_HEIGHT_REM = 4.6;

/**
 * #1145: the top-right chip cluster (slow mode, format, flat board, room, connection, bug
 * report) is ~46rem wide and runs left to x~745 at 1500px, under the fifth plate (4 heroes
 * + enemy end at ~848px). Below this viewport width the Adventure plate row drops by
 * ADVENTURE_PLATE_DROP, under the cluster, rather than running beneath it. The drop plus
 * the shortened compact plate (4.6rem) still ends above DOCK_TOP, so no board space is
 * covered. Five compact plates + the cluster only fit side by side from ~1600px.
 */
export const ADVENTURE_PLATE_DROP_BELOW_PX = 1650;
export const ADVENTURE_PLATE_DROP = "2.2rem";
export const CHIP_CLUSTER_WIDTH_REM = 48;
