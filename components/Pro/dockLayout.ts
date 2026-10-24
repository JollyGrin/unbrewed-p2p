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

/**
 * #1310: phone (< md) overlay column. It hugs the screen edge (no dock slot), and starts
 * below the HUD phase bar that spans the width under the seat plates.
 */
export const ADVENTURE_BOARD_TOP_PHONE = "5.8rem";
export const ADVENTURE_BOARD_MAX_HEIGHT_PHONE = `calc(100vh - ${ADVENTURE_BOARD_TOP_PHONE} - ${HAND_FAN_RESERVE_REM}rem)`;

/**
 * #1405: the board-side band (initiative strip + threat track; the Keen Hearing panel beside or,
 * wrapped, under them, p2p #1456/#1462) floats above the map: desktop under the HUD band
 * (DOCK_TOP), left of the Adventure column; phone full width under the chip row.
 *
 * p2p #1477: on a phone the band also holds the drawer toggle's slot (a phone-only spacer,
 * ADVENTURE_DRAWER_TOGGLE_H tall, at the band's bottom-right: its own row under the strip +
 * track, or beside a wrapped Keen Hearing panel in the 6.5rem lane it leaves free), and the
 * column hangs from the band's MEASURED bottom so the toggle lands exactly on that slot. The
 * page fits the board under the measured band, so the toggle never covers a printed space or
 * a threat-track cell however tall the strip, track or panel grow.
 */
export const ADVENTURE_BAND_TOP = DOCK_TOP;
export const ADVENTURE_BAND_TOP_PHONE = ADVENTURE_BOARD_TOP_PHONE;
/** The ADVENTURE drawer toggle's height (it heads the column). */
export const ADVENTURE_DRAWER_TOGGLE_H = "1.6rem";
/** Until the band is measured: 5.8rem (ADVENTURE_BOARD_TOP_PHONE) + 8rem for the strip + track + 0.4rem gap, one literal so the cap stays a flat calc. */
export const ADVENTURE_COLUMN_TOP_PHONE = "14.2rem";
export const ADVENTURE_COLUMN_MAX_HEIGHT_PHONE = `calc(100vh - ${ADVENTURE_COLUMN_TOP_PHONE} - ${HAND_FAN_RESERVE_REM}rem)`;
/**
 * Phone column top + height cap from the band's measured viewport bottom (px; 0 = not yet
 * measured, the constants above): the toggle's bottom sits on the band's bottom (p2p #1477).
 */
export const adventureColumnPhone = (bandBottom: number): { top: string; maxH: string } =>
  bandBottom > 0
    ? {
        top: `calc(${bandBottom}px - ${ADVENTURE_DRAWER_TOGGLE_H})`,
        maxH: `calc(100vh - ${bandBottom}px + ${ADVENTURE_DRAWER_TOGGLE_H} - ${HAND_FAN_RESERVE_REM}rem)`,
      }
    : { top: ADVENTURE_COLUMN_TOP_PHONE, maxH: ADVENTURE_COLUMN_MAX_HEIGHT_PHONE };
