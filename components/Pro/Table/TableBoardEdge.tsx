/**
 * The board's own physical thickness (phase-5 target #1 — "the board has no
 * thickness"). Everything else in this view draws the map as an infinitely
 * thin decal on the tilted plane; this gives it a visible SIDE, so the near
 * edge reads as a solid slab resting on the table instead of a sheet of
 * paper lying at an angle.
 *
 * HOW THE EXTRUSION WORKS. A rectangle the width of the board is positioned
 * at `top: 100%` of the SAME box the board image fills (i.e. hinged exactly
 * at the board's own bottom/near edge, in its LOCAL, untilted coordinate
 * frame), then folded downward with `transform-origin: top` +
 * `rotateX(-EDGE_FOLD_DEG deg)`. This component is rendered as a CHILD of
 * the SAME `preserve-3d` stage plane the board image itself sits in
 * (`TableStage`'s `data-table-stage-plane`), sharing the identical
 * `boardTransform(tiltDeg, yawDeg)` ancestor rotation — the fold happens in
 * the board's own local, untilted frame, and the shared ancestor transform
 * then carries the folded flap along as one rigid object, tilting (and
 * yawing) with it exactly the way a real board's thickness would.
 *
 * WHY NOT A TRUE 90° FOLD. See `tableProjection.ts`'s "Board thickness"
 * section for the full story: a perpendicular cube face is the textbook
 * technique, but Playwright's bundled WebKit — this project's own required
 * screenshot-verification engine — renders `perspective` as a total no-op
 * and falls back to pure orthographic projection, under which a face folded
 * to EXACTLY 90° is a mathematical zero-width line, not merely thin.
 * `EDGE_FOLD_DEG` (45°, a deliberate bevel rather than a cliff face) reads
 * correctly under both that fallback and a real device's correct perspective
 * compositing, and was confirmed to stay comfortably visible across this
 * view's entire tilt range in an isolated repro before landing here.
 *
 * ONLY THE NEAR EDGE. A real slab has four sides, but at this camera angle
 * (a tilt with, at most, a restrained few degrees of yaw — see
 * `TABLE_YAW_DEG`) the left/right/far edges stay edge-on to the viewer and
 * would render as an invisible sliver even if drawn — not worth the extra
 * geometry until this view ever adopts a much stronger yaw.
 *
 * STACKING. `Z_BOARD_EDGE` (well under standees' `Z_BASE` band — see
 * tableProjection.ts) keeps this face pinned behind every piece even though,
 * being genuinely displaced in Z rather than billboard-coplanar with the
 * camera the way a standee is, the browser's native 3D sort would likely
 * get it right on its own; the explicit z-index costs nothing and matches
 * this file's policy (tableProjection.ts's header comment on `Z_BASE`) of
 * never trusting that sort for anything that matters.
 *
 * COLOR. A plain neutral cardboard/wood gradient — no map art of any kind is
 * reused or implied here, so this needs no per-map data and stays correct
 * for every board this view ever renders (asset rule: CSS only, nothing
 * downloaded or derived from any specific board's own art).
 */
import { Box } from "@chakra-ui/react";
import { boardThicknessPx, EDGE_FOLD_DEG, Z_BOARD_EDGE } from "@/lib/pro/tableProjection";

export interface TableBoardEdgeProps {
  frameW: number;
  frameH: number;
}

export const TableBoardEdge = ({ frameW, frameH }: TableBoardEdgeProps) => {
  if (!frameW || !frameH) return null;
  const thicknessPx = boardThicknessPx(frameW);

  return (
    <Box
      position="absolute"
      // Hinged exactly at the plane's own bottom edge, in LOCAL px (not a
      // "100%" percentage) — matches the sizing spacer's own box, and keeps
      // the hinge line pixel-exact regardless of rounding in intermediate
      // percentage math.
      top={`${frameH}px`}
      left={0}
      w={`${frameW}px`}
      h={`${thicknessPx}px`}
      pointerEvents="none"
      zIndex={Z_BOARD_EDGE}
      borderBottomRadius="0.5rem"
      // A top-to-bottom gradient reads as a beveled edge catching light at
      // its top (where it meets the board surface) and falling into shadow
      // toward the bottom — cheap (a single gradient fill, no filter) and
      // consistent with the same "one light source" convention
      // SHADOW_OFFSET_X/Y establishes for every piece's own contact shadow.
      // The inset highlight in `boxShadow` (a crisp 1px line at the seam) is
      // what keeps the seam readable even where the fold's own visible
      // height is thinnest (near `MAX_TILT_DEG` — see EDGE_FOLD_DEG's own
      // comment on the visible-height range): a plain gradient alone can
      // wash out at a few px tall, while a hard, bright seam line survives
      // at any width.
      bg="linear-gradient(180deg, #7a5c3d 0%, #3a2a1c 55%, #1c130d 100%)"
      boxShadow="inset 0 1px 0 rgba(255,220,180,0.4), 0 6px 14px rgba(0,0,0,0.55)"
      style={{
        transformOrigin: "top",
        transform: `rotateX(-${EDGE_FOLD_DEG}deg)`,
      }}
    />
  );
};
