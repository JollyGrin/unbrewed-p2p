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

/**
 * Extra right inset (px) on desktop when a format mounts the Adventure overlay column
 * (17rem wide + 0.75rem gap, left of the dock; see dockLayout.ts). The board fits
 * clear of that column instead of running underneath it, so the turn-order row,
 * threat track, dials and "players choose" panel can never hide a printed scenario object
 * badge or a space (#1139).
 */
export const ADVENTURE_OVERLAY_INSET = 17.75 * 16;

/**
 * px the Adventure board-side band (initiative strip + threat track, #1405; the Keen Hearing
 * revealed-hand panel beside them, #1456) takes ABOVE the map, so the initial fit starts under it.
 * Desktop: it sits below the HUD band; phone: below the chip row. Applied whenever a format
 * overlay is mounted (`formatOverlayRight > 0`). A FLOOR: the band is also measured
 * (`formatBandBottom`, p2p #1462) and a taller band — the revealed-hand panel wrapped under the
 * strip on a phone or a narrow desktop, a tall initiative strip, the phone drawer toggle's slot
 * (p2p #1477) — pushes the fit down past these.
 */
export const ADVENTURE_BAND_FIT = { desktop: 144, mobile: 124 } as const;

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
/** …and the lane they own, so no pill ever stacks behind them */
export const HAND_PEEK_H = "6.5rem";
/** upper bound for a drawer card — a small hand should not render posters */
export const HAND_DRAWER_CARD_MAX = "7.4rem";
/** the fallback width when a huge hand falls back to horizontal scroll */
export const HAND_DRAWER_CARD_SCROLL = "6.25rem";

/**
 * What a corner HP chip calls a seat.
 *
 * The hero's own name beats "You"/"Opponent" there — it is what the player is
 * actually tracking, and the parchment rim already says which seat is theirs.
 * Fitting it into a corner chip goes, in order:
 *
 *  1. drop a leading article — "The Mandalorian" must never shorten to "THE",
 *     which identifies nobody;
 *  2. take the leading word if it carries the name ("Cairne Bloodhoof" →
 *     CAIRNE, "Malfurion Stormrage" → MALFURION);
 *  3. otherwise ellipsize, so a single long word still says something.
 */
export const CHIP_NAME_MAX = 11;
/** A leading word this short is a filler, not the name. */
const CHIP_WORD_MIN = 3;

export const chipSeatName = (heroName: string | undefined, fallback: string): string => {
  const raw = (heroName ?? "").trim();
  if (!raw) return fallback;
  const name = raw.replace(/^(the|a|an)\s+/i, "").trim() || raw;
  if (name.length <= CHIP_NAME_MAX) return name;
  const [first] = name.split(/\s+/);
  if (first.length >= CHIP_WORD_MIN && first.length <= CHIP_NAME_MAX) return first;
  return `${name.slice(0, CHIP_NAME_MAX - 1)}…`;
};

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
  /**
   * Measured height of the decision sheet while it is SHOWN (px), 0 otherwise.
   *
   * The sheet is the one overlay the fit does account for: it is force-open for
   * whole stretches of a game (a prompt, a combat), and a board centred behind
   * it renders half off-screen with a screenful of empty table above — which is
   * exactly what the first direction-B build did. The hand drawer and the log
   * sheet stay excluded: you are looking at THEM, not at the board, and they
   * come and go too fast to move the map for.
   */
  sheetH?: number;
  /** measured width of the landscape rail (px) */
  railW?: number;
  /** desktop only: px a format overlay column (e.g. Adventure's, `ADVENTURE_OVERLAY_INSET`) takes left of the dock */
  formatOverlayRight?: number;
  /**
   * Measured viewport-y bottom (px) of the format's band above the map (Adventure's strip +
   * track + revealed-hand panel), 0 until measured. Only read while a format overlay is mounted.
   * The band is fixed chrome the board must start UNDER, like the chip row: when it grows past
   * `ADVENTURE_BAND_FIT` (a Keen Hearing reveal wrapped onto a second row, p2p #1462) the fit
   * follows it; a shorter band changes nothing, so a game without a reveal fits as before.
   */
  formatBandBottom?: number;
}

/**
 * px of the board stage standing chrome hides, so the initial fit centers the
 * map in the part of the screen the player can actually see: the HP chips on
 * top, the floating controls (and the decision sheet, when it is up) below.
 */
export const boardFitInsetFor = ({
  mode,
  chipsH = 0,
  controlsH = 0,
  sheetH = 0,
  railW = 0,
  formatOverlayRight = 0,
  formatBandBottom = 0,
}: BoardInsetArgs): Required<ZoomPanInset> => {
  const band = formatOverlayRight > 0 ? ADVENTURE_BAND_FIT : null;
  // The band's measured bottom edge, where the constants undershoot it. No gutter: the floors
  // already put the map's edge exactly at the band's bottom on a phone and at 992px.
  const bandBottom = band ? formatBandBottom : 0;
  if (mode === "desktop")
    return {
      top: Math.max(DESKTOP_INSET.top + (band?.desktop ?? 0), bandBottom),
      bottom: DESKTOP_INSET.bottom,
      left: DESKTOP_INSET.side,
      right: DESKTOP_INSET.dockColumn + formatOverlayRight,
    };

  const top = Math.max((chipsH || MOBILE_CHIPS_H) + MOBILE_GUTTER + (band?.mobile ?? 0), bandBottom);
  if (mode === "rail")
    return {
      top,
      bottom: MOBILE_GUTTER,
      left: MOBILE_GUTTER,
      right: (railW || RAIL_WIDTH) + MOBILE_GUTTER,
    };

  return {
    top,
    bottom: Math.max(controlsH || MOBILE_CONTROLS_H, sheetH) + MOBILE_GUTTER,
    left: MOBILE_GUTTER,
    right: MOBILE_GUTTER,
  };
};

/** Which mobile shell is mounted — the dock's `mobile` prop. */
export type MobileShell = "portrait" | "rail" | "hud" | false;

/**
 * The prompt that should pop the mobile hand drawer open, or null. A prompt
 * whose own options name cards in YOUR hand is a decision about the hand, so
 * the drawer comes to meet it — except in the tabletop HUD (#874): its drawer
 * is page-level and stacks OVER the side sheet holding the question, and the
 * drawer's buttons can't answer a prompt anyway. The HUD sheet already shows
 * those cards as its own face picker, so the drawer stays shut there.
 * Never during the mulligan, which puts the opening hand on screen itself.
 */
export const handDecisionKeyFor = ({
  shell,
  promptId,
  mulligan,
  optionInstances,
  hand,
}: {
  shell: MobileShell;
  promptId: string | null;
  mulligan: boolean;
  optionInstances: readonly string[];
  hand: readonly string[];
}): string | null =>
  (shell === "portrait" || shell === "rail") &&
  promptId !== null &&
  !mulligan &&
  optionInstances.some((i) => hand.includes(i))
    ? promptId
    : null;
