/**
 * The tabletop HUD's geometry and decisions (phones in landscape, tabletop
 * board view only).
 *
 * The flat board's landscape layout stands a 230px decision rail along the
 * right edge, and the board gets whatever is left of it. The tabletop view
 * copies the official app's arrangement instead: the board takes the whole
 * screen, and the chrome floats over the parts of it nothing is printed on —
 * the two player plates in the top corners (a tilted board is NARROWER at the
 * far edge, so those corners are empty table), a one-line banner between
 * them, the hand fanned over the near rim, and the turn's action as a
 * hexagon in the bottom-right corner. The decision sheet (the dock's full
 * body) still exists, but only while a decision needs it.
 *
 * What lives here is the part of that which can be wrong without anyone
 * seeing it: how much of the stage the fit keeps clear, and which hexagon a
 * given moment offers. Both are pure so they are pinned by tests rather than
 * by screenshots.
 */
import { tileKindOf } from "./actionTiles";
import type { Action } from "./protocol";
import type { ZoomPanInset } from "./useZoomPan";
import { RAIL_WIDTH } from "./mobileLayout";
import { SafeAreaInsets, ZERO_INSETS } from "./useSafeAreaInsets";

/** Breathing room between the board and the HUD. */
export const HUD_GUTTER = 8;

/**
 * How much of the stage's TOP edge the fit keeps clear (px) — less than the
 * plates are tall (about 60px), on purpose.
 *
 * The plates sit in the top corners, and a board tipped back 40° is narrower
 * at its far edge by the edge ratio (1.43), so those corners are table and
 * frame, not spaces. Reserving the plates' full height kept the board 20%
 * smaller than it needed to be. What the reserve must still clear is the
 * banner between the plates and the far row's standees, which rise highest.
 * Measured on the probe's board (iPhone 14 landscape, Secluded Temple,
 * 2026-09-23): 30px hid a far-row hero's HP badge under the banner; 40px was
 * clean at rest, but only 10px from that failure on the one board measured;
 * 48px leaves margin for boards whose far row sits nearer the edge, at
 * meanSpaceWidth 45.9–46.6 against the rail layout's 40.3. (Mid-prompt the
 * focus zoom can slide spaces that are NOT picks under the HUD — that is
 * zooming, not a fault; picks and fighters stay clear, which the probe checks.)
 */
export const HUD_TOP_RESERVE_PX = 48;

/**
 * How much of the stage's bottom edge the fit gives up to the hand (px).
 *
 * Deliberately less than the fan is tall. The fan stands over the board's
 * NEAR RIM — the frame and table below the last row of spaces — exactly as
 * the official app's hand does; giving it its full height would shrink every
 * space to keep a strip of wooden frame visible. The probe's
 * `hudCoveredSpaces` is what says this number is still small enough: no
 * space may sit under the fan at rest.
 */
export const HUD_HAND_VISIBLE_PX = 36;

/**
 * px of the stage the HUD keeps, so the initial fit centres the board in what
 * is left. The sides stay open (unless the decision sheet is up) — the
 * hexagon and the side buttons sit in the corners a trapezoid does not
 * reach — and none of it is measured: every
 * number here is checked by the probe (`hudCoveredSpaces`, `hiddenFighters`)
 * rather than derived from the chrome's boxes, which overlap the board by
 * design.
 */
export interface TableHudInsetArgs {
  /** the decision sheet stands along the right edge */
  sheetShown?: boolean;
  /** the device's safe-area insets (lib/pro/useSafeAreaInsets) */
  safe?: SafeAreaInsets;
}

export const tableHudFitInset = ({ sheetShown = false, safe = ZERO_INSETS }: TableHudInsetArgs = {}): Required<
  ZoomPanInset
> => ({
  // Every edge also clears the device's own unusable strip: the page covers
  // the whole screen, and an iPhone on its side has its camera cut-out 59px in
  // from one side — the board used to fill the width right into it.
  top: HUD_TOP_RESERVE_PX + safe.top,
  bottom: HUD_HAND_VISIBLE_PX + safe.bottom,
  left: HUD_GUTTER + safe.left,
  // The decision sheet is the one piece of chrome the fit makes room for, as
  // the portrait layout does: it stays up for a whole prompt, and a prompt's
  // gold spaces must not be framed underneath it.
  right: (sheetShown ? RAIL_WIDTH + 2 * HUD_GUTTER : HUD_GUTTER) + safe.right,
});

/**
 * Where the board's "reset view" button stands under the HUD: its usual spot,
 * the fit's bottom-left corner, is where the side buttons end — so it moves
 * right of them, into the strip left of the hand fan.
 */
export const HUD_RESET_VIEW_SPOT = {
  left: "calc(4.4rem + env(safe-area-inset-left, 0px))",
  bottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))",
} as const;

/** Where the decision sheet's top edge sits: just under the plates (about 4rem tall). */
export const HUD_SHEET_TOP = "4.4rem";

/** The longest label a hexagon carries before it is shortened (characters). */
export const HEX_LABEL_MAX = 14;

const TILE_LABEL = { maneuver: "Maneuver", scheme: "Scheme", attack: "Attack" } as const;

/**
 * What the big hexagon says for an action. The three core actions go by their
 * tile's name; anything else is the dock's own sentence, cut at a word so it
 * still fits two lines of a hexagon (the full sentence is its title).
 */
export const hexLabelFor = (action: Action, describe: (a: Action) => string): string => {
  const kind = tileKindOf(action);
  if (kind) return TILE_LABEL[kind];
  if (action.type === "END_MANEUVER") return "End move";
  const text = describe(action);
  if (text.length <= HEX_LABEL_MAX) return text;
  // The longest run of whole leading words that fits; a first word longer than
  // the hexagon is cut mid-word, which still says more than nothing.
  const words = text.split(/\s+/);
  const fits = (n: number) => words.slice(0, n).join(" ").length <= HEX_LABEL_MAX;
  const count = words.findIndex((_, i) => !fits(i + 1));
  const head = count > 0 ? words.slice(0, count).join(" ") : text.slice(0, HEX_LABEL_MAX - 1);
  return `${head}…`;
};

export type HexId = "primary" | "more" | "undo" | "end-move" | "cancel-move" | "open-sheet";

export interface HexSpec {
  id: HexId;
  label: string;
  /** gold = the thing to do now; outline = a finishing or secondary step */
  emphasis: "gold" | "outline" | "plain";
  disabled: boolean;
}

export interface TableHudControlsInput {
  /** a hop-by-hop walk in progress */
  stepping: { canEnd: boolean; commitLabel?: string } | null;
  /** the decision sheet is on screen */
  sheetShown: boolean;
  /**
   * A decision waits but its sheet is not up: a prompt answered by tapping
   * the board ("board-pick"), or a forced sheet the player put away
   * ("minimized"). Null otherwise.
   */
  compact: "board-pick" | "minimized" | null;
  /** the one action the turn promotes (the spacebar's, else the dock's first) */
  primary: Action | null;
  /** how many other legal rows the sheet holds */
  extra: number;
  canUndo: boolean;
  undoPending: boolean;
}

export interface TableHudControls {
  main: HexSpec | null;
  /** the small hexagons beside the big one, left to right */
  minor: HexSpec[];
}

const hex = (id: HexId, label: string, emphasis: HexSpec["emphasis"], disabled = false): HexSpec => ({
  id,
  label,
  emphasis,
  disabled,
});

/**
 * Which hexagons the corner shows. The order of the checks is the priority:
 * an open sheet owns every answer (and would sit under a hexagon), a walk in
 * progress can only be finished or abandoned, a waiting decision is reopened,
 * and only then does the turn's own action lead.
 */
export const tableHudControls = (
  input: TableHudControlsInput,
  describe: (a: Action) => string
): TableHudControls => {
  if (input.sheetShown) return { main: null, minor: [] };
  if (input.stepping)
    return {
      main: hex("end-move", input.stepping.commitLabel ?? "End move", "outline", !input.stepping.canEnd),
      minor: [hex("cancel-move", "Cancel", "plain")],
    };
  const undo = input.canUndo ? [hex("undo", input.undoPending ? "Asked" : "Undo", "plain", input.undoPending)] : [];
  if (input.compact)
    return {
      main:
        input.compact === "minimized" ? hex("open-sheet", "Open", "gold") : hex("open-sheet", "Options", "outline"),
      minor: undo,
    };
  const more = input.extra > 0 ? [hex("more", `+${input.extra}`, "plain")] : [];
  if (!input.primary) return { main: null, minor: [...undo, ...more] };
  const finishing = input.primary.type === "END_MANEUVER";
  return {
    main: hex("primary", hexLabelFor(input.primary, describe), finishing ? "outline" : "gold"),
    minor: [...undo, ...more],
  };
};

export interface TableHudBannerInput {
  /** the board instruction on offer (a prompt's own, else the dock's) */
  hint: string | null;
  /** a decided combat's one-line result */
  combatSummary: string | null;
  stepping: { fighterName: string; movesLeft: number } | null;
  /** whose turn it is; null outside a live game (lobby, replay) */
  turn: { mine: boolean; pips: number; label: string } | null;
}

export interface TableHudBanner {
  title: string;
  detail: string | null;
  /** actions left, drawn as dots; 0 when it is not this seat's turn */
  pips: number;
  tone: "mine" | "theirs";
}

/**
 * The banner between the plates: one instruction, never a paragraph. What
 * the player can do on the board right now beats whose turn it is, because
 * the plates already say that.
 */
/** The dock's board hints start lower-case ("tap a gold space…"); a banner is a heading. */
const sentenceCase = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export const tableHudBanner = ({ hint, combatSummary, stepping, turn }: TableHudBannerInput): TableHudBanner | null => {
  if (!turn) return null;
  const tone = turn.mine ? "mine" : "theirs";
  if (stepping)
    return {
      title: `Tap a gold space to move ${stepping.fighterName}`,
      detail: `${stepping.movesLeft} move${stepping.movesLeft === 1 ? "" : "s"} left`,
      pips: 0,
      tone,
    };
  return { title: sentenceCase(hint ?? combatSummary ?? turn.label), detail: null, pips: turn.pips, tone };
};

/** Width of a card in the hand fan (rem) — the portrait peek's own size. */
export const HUD_FAN_CARD_W_REM = 4.6;
/** Distance between neighbouring cards' centres in a small hand (rem). */
export const HUD_FAN_STEP_REM = 2.6;
/**
 * The furthest the first and last card centres may be apart (rem). Past it a
 * big hand closes up instead of spreading: the fan's lane is the bottom
 * centre, between the side buttons and the hexagons, and on an iPhone-14-wide
 * screen this keeps its outer card clear of the hexagons.
 */
export const HUD_FAN_MAX_SPREAD_REM = 16;
/** Tilt per card away from the centre (deg). */
export const HUD_FAN_TILT_DEG = 5;
/** How much lower each card sits per step² from the centre (px), for the arc. */
export const HUD_FAN_ARC_PX = 3;
/**
 * How far the centre card's top edge rises above the screen's bottom edge
 * (px). The rest of each card hangs below the screen, so the fan reads as a
 * held hand over the table's near rim without covering the spaces above it.
 */
export const HUD_FAN_RISE_PX = 58;

export interface FanCard {
  /** offset of the card's centre from the fan's centre (rem) */
  x: number;
  /** tilt (deg) */
  rotate: number;
  /** how much lower than the centre card it sits (px) */
  drop: number;
}

/** Where each card of a hand of `count` sits in the fan, left to right. */
export const handFanLayout = (count: number): FanCard[] => {
  if (count <= 0) return [];
  const step = count > 1 ? Math.min(HUD_FAN_STEP_REM, HUD_FAN_MAX_SPREAD_REM / (count - 1)) : 0;
  return Array.from({ length: count }, (_, i) => {
    const offset = i - (count - 1) / 2;
    // `+ 0` folds the centre card's -0 into 0.
    return { x: offset * step + 0, rotate: offset * HUD_FAN_TILT_DEG + 0, drop: offset * offset * HUD_FAN_ARC_PX };
  });
};
