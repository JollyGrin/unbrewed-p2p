/**
 * Sizes the mobile /pro/game arrangement is built from, and the board-fit inset
 * derived from them (issue #708, direction B — "full-bleed board + hand drawer").
 *
 * Direction B gives the BOARD the whole viewport and floats everything else
 * over it: HP chips in the top corners, a contextual action pill row and the
 * log / hand / overflow controls along the bottom edge, with the decision sheet
 * and the hand drawer arriving as overlays only when they are needed. So the
 * inset here is small by design — it clears the two bands of persistent chrome
 * and nothing else, because a sheet that appears for one decision must not
 * re-fit the map underneath it.
 *
 * `boardFitInsetFor` is the one piece of geometry both arrangements share, so
 * it lives here as a pure function: the desktop branch returns the exact
 * constants the page has always used (120/136/16, plus the dock's column), and
 * the mobile branches return the measured persistent chrome.
 */
import type { ProLayoutMode } from "./useProLayout";
import type { ZoomPanInset } from "./useZoomPan";

/** Desktop insets — the fixed HUD band, hand fan and dock column. Unchanged. */
export const DESKTOP_INSET = { top: 120, bottom: 136, side: 16, dockColumn: 320 } as const;

/** Breathing room between the board and the mobile chrome. */
export const MOBILE_GUTTER = 8;

/** Fallbacks used for the very first frame, before the chrome is measured. */
export const MOBILE_CHIPS_H = 48;
export const MOBILE_CONTROLS_H = 76;

/** Width of the landscape decision rail (matches `RAIL_WIDTH_CSS`). */
export const RAIL_WIDTH = 230;
export const RAIL_WIDTH_CSS = "230px";

/** Hand-card widths. The fan keeps its desktop size; the mobile surfaces are
 *  sized so a card reads at a glance and a tap target is never a sliver. */
export const HAND_CARD_W_FAN = "8.5rem";
/** the landscape rail's compact strip */
export const HAND_CARD_W_RAIL = "4rem";
/** the fan-peek's three stacked card backs */
export const HAND_PEEK_CARD_W = "4.6rem";
/** upper bound for a drawer card — a small hand should not render posters */
export const HAND_DRAWER_CARD_MAX = "7.4rem";
/** the fallback width when a huge hand falls back to horizontal scroll */
export const HAND_DRAWER_CARD_SCROLL = "6.25rem";

/** Minimum tap target — every mobile control and action row clears it. */
export const TAP_TARGET = "2.75rem";

/**
 * How the hand drawer lays a hand out.
 *
 * Dean's rule: tapping the fan-peek shows the WHOLE hand at once — prefer
 * wrapping into two rows over making the player scroll. So up to three cards
 * sit in one row, four to eight wrap into two, and only a genuinely oversized
 * hand (9+) falls back to a horizontal scroller, where two rows of anything
 * legible no longer fit a half-screen drawer.
 */
export const handDrawerLayout = (count: number): { columns: number; scroll: boolean } => {
  if (count <= 0) return { columns: 1, scroll: false };
  if (count <= 3) return { columns: count, scroll: false };
  if (count <= 8) return { columns: Math.ceil(count / 2), scroll: false };
  return { columns: 1, scroll: true };
};

export interface BoardInsetArgs {
  mode: ProLayoutMode;
  /** measured height of the floating HP-chip row (px) */
  chipsH?: number;
  /** measured height of the persistent bottom controls (px) */
  controlsH?: number;
  /** measured width of the landscape rail (px) */
  railW?: number;
}

/**
 * px of the board stage hidden behind the PERSISTENT chrome, so the initial fit
 * centers the map in the part of the screen nothing is standing on. Overlays
 * (the decision sheet, the hand drawer, the log) are deliberately not counted:
 * they come and go with a single decision, and re-fitting the board under each
 * one would make the map jump every time a prompt opened.
 */
export const boardFitInsetFor = ({
  mode,
  chipsH = 0,
  controlsH = 0,
  railW = 0,
}: BoardInsetArgs): Required<ZoomPanInset> => {
  if (mode === "desktop")
    return {
      top: DESKTOP_INSET.top,
      bottom: DESKTOP_INSET.bottom,
      left: DESKTOP_INSET.side,
      right: DESKTOP_INSET.dockColumn,
    };

  const top = (chipsH || MOBILE_CHIPS_H) + MOBILE_GUTTER;
  if (mode === "rail")
    return {
      top,
      bottom: MOBILE_GUTTER,
      left: MOBILE_GUTTER,
      right: (railW || RAIL_WIDTH) + MOBILE_GUTTER,
    };

  return {
    top,
    bottom: (controlsH || MOBILE_CONTROLS_H) + MOBILE_GUTTER,
    left: MOBILE_GUTTER,
    right: MOBILE_GUTTER,
  };
};
