/**
 * The table the board stands on, and the light that falls on the board.
 *
 * WHY THE BOARD DID NOT READ AS 3D (owner feedback, 2026-09-23: "sieht nicht
 * wirklich 3D-mäßig aus"). With the camera calibrated to the official app's
 * gentle perspective, a tilted board sitting on a flat page-colored backdrop
 * reads as a squashed picture, not an object: nothing around it recedes, so
 * the eye has no ground to measure depth against. The reference app never
 * shows its board alone — it sits on a table whose lines run off toward the
 * horizon, and the board casts a shadow onto it.
 *
 * `TableSurface` is that table. It lives INSIDE the tilted stage plane, so the
 * same perspective acts on it: its plank seams run away from the camera and
 * visibly converge, which is the strongest depth cue there is and costs one
 * gradient. It sits `boardThicknessPx` BELOW the board (`translateZ`), so the
 * board genuinely stands on it: the extruded edge (TableBoardEdge) spans that
 * gap, and the two layers shift against each other by real parallax as the
 * zoom moves.
 *
 * It reaches far past the board on every side — furthest at the back, where
 * the grain has the most room to converge — and fades into the stage's own
 * vignette, so it has no visible edge of its own. It is a CHILD of the plane,
 * never the plane itself, so the fit (which measures the plane and the edge;
 * see lib/pro/fitContent) ignores it: the table is scenery, not board.
 *
 * `TableBoardLight` is the other half: one key light from the upper left
 * (the same light every standee shadow assumes — SHADOW_OFFSET_X/Y), a little
 * haze toward the far edge (distant things lose contrast), and a bright bevel
 * along the board's rim where the face meets the edge.
 */
import { Box } from "@chakra-ui/react";
import { boardThicknessPx } from "@/lib/pro/tableProjection";

/** How far the table reaches past the board on each side, in percent of the
 *  board's own size. The far side gets the most: that is where the seams
 *  converge. */
const REACH_PCT = { top: 70, right: 45, bottom: 35, left: 45 } as const;
const SURFACE_REACH = {
  top: `-${REACH_PCT.top}%`,
  right: `-${REACH_PCT.right}%`,
  bottom: `-${REACH_PCT.bottom}%`,
  left: `-${REACH_PCT.left}%`,
};
/** Where the board sits INSIDE the surface: the surface is (100 + both reaches)
 *  percent of the board on each axis, so each side's share of that is the
 *  inset that lands exactly on the board's own edge. */
const spanX = 100 + REACH_PCT.left + REACH_PCT.right;
const spanY = 100 + REACH_PCT.top + REACH_PCT.bottom;
const BOARD_IN_SURFACE = {
  left: `${(REACH_PCT.left / spanX) * 100}%`,
  right: `${(REACH_PCT.right / spanX) * 100}%`,
  top: `${(REACH_PCT.top / spanY) * 100}%`,
  bottom: `${(REACH_PCT.bottom / spanY) * 100}%`,
};

/**
 * Warm dark wood with plank seams running AWAY from the camera (vertical in the
 * plane's own space), plus a fine cross-grain. The seams are what converge.
 * The outer radial fade dissolves the table into the stage vignette so it
 * never shows an edge of its own.
 */
const SURFACE_IMAGE = [
  "radial-gradient(ellipse 52% 50% at 50% 60%, rgba(18, 10, 12, 0) 0%, rgba(18, 10, 12, 0) 42%, rgba(18, 10, 12, 0.96) 88%)",
  "repeating-linear-gradient(90deg, rgba(8, 4, 4, 0.2) 0px, rgba(8, 4, 4, 0.2) 2px, rgba(0, 0, 0, 0) 2px, rgba(0, 0, 0, 0) 4.2%)",
  "repeating-linear-gradient(0deg, rgba(255, 225, 190, 0.03) 0px, rgba(255, 225, 190, 0.03) 1px, rgba(0, 0, 0, 0) 1px, rgba(0, 0, 0, 0) 11px)",
  "linear-gradient(180deg, #241712 0%, #33221a 55%, #3e291f 100%)",
].join(", ");

/** The board's shadow on the table: soft, dark, and pushed a little toward
 *  the viewer and to the right, away from the upper-left light. */
const BOARD_SHADOW = "0 18px 34px 10px rgba(6, 2, 4, 0.7)";

export interface TableSurfaceProps {
  /** The frame's measured LAYOUT width (TableStage's `frameW`); 0 before the
   *  first measurement, when there is nothing sensible to draw yet. */
  frameW: number;
}

export const TableSurface = ({ frameW }: TableSurfaceProps) => {
  if (!frameW) return null;
  const depth = boardThicknessPx(frameW);
  return (
    <Box
      data-table-surface
      position="absolute"
      {...SURFACE_REACH}
      pointerEvents="none"
      style={{ transform: `translateZ(-${depth}px)`, backgroundImage: SURFACE_IMAGE }}
    >
      {/* The shadow falls ON the table, so it lives in the table's plane,
          placed exactly under the board (BOARD_IN_SURFACE). */}
      <Box position="absolute" style={{ ...BOARD_IN_SURFACE, borderRadius: "0.5rem", boxShadow: BOARD_SHADOW }} />
    </Box>
  );
};

/** Key light, far haze and rim bevel over the board art; see the header. */
const BOARD_LIGHT_IMAGE = [
  "radial-gradient(ellipse 70% 80% at 22% 12%, rgba(255, 232, 196, 0.14) 0%, rgba(255, 232, 196, 0) 60%)",
  "linear-gradient(180deg, rgba(24, 14, 22, 0.28) 0%, rgba(24, 14, 22, 0) 38%, rgba(0, 0, 0, 0) 80%, rgba(0, 0, 0, 0.12) 100%)",
].join(", ");
const BOARD_BEVEL = "inset 0 0 0 1.5px rgba(255, 236, 205, 0.28), inset 0 0 24px rgba(0, 0, 0, 0.35)";

export const TableBoardLight = () => (
  <Box
    data-table-board-light
    position="absolute"
    inset={0}
    borderRadius="0.5rem"
    pointerEvents="none"
    style={{ backgroundImage: BOARD_LIGHT_IMAGE, boxShadow: BOARD_BEVEL }}
  />
);
