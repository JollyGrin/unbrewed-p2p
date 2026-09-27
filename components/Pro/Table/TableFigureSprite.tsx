/**
 * A pre-rendered miniature standing on a standee's feet (see lib/pro/figures
 * for where the renders come from and why they never enter the repo).
 *
 * It lives inside the standee's billboarded plate, whose BOTTOM CENTRE is the
 * fighter's feet — the point TableStandeeAnchor pivots the billboard about and
 * centres the base disc on. The image is sized so the model's own base spans
 * that disc, then offset so the model's ground point lands exactly on the
 * feet. It overflows the plate freely: a miniature is taller and wider than
 * the token plate it replaces, and the plate's box still anchors the badges.
 *
 * The render already contains the base, seen from the table camera's own
 * elevation (90° − the board's tilt — scripts/figures/camera.cjs), so the
 * in-plane base disc under it reads as the seat-colored rim of the
 * miniature's own base rather than a second, separate disc.
 *
 * TWO HALVES. Only the part of the image above the feet stands upright here;
 * the part below them (the front of the model's base) would stand below the
 * board's surface and be hidden by it — see `figureGroundSlice`. That part is
 * `TableFigureGround`, which lies in the board plane via the anchor's
 * `ground` slot. The two meet on the feet line.
 */
import { Box } from "@chakra-ui/react";
import { Figure, figureGroundSlice, figureSpriteBox } from "@/lib/pro/figures";

/**
 * How far each half reaches past the feet line into the other, px. Two edges
 * meeting exactly on a sub-pixel line leave a hairline gap on WebKit; the
 * upright half's overlap sinks into the board anyway and the flat half's is
 * covered by the upright one.
 */
const SEAM_OVERLAP_PX = 0.75;

export interface TableFigureSpriteProps {
  figure: Figure;
  /** Diameter of the standee's in-plane base disc, px. */
  baseDiamPx: number;
  /** The billboarded plate's own size, px — its bottom centre is the feet. */
  plateW: number;
  plateH: number;
  /** Let the figure's body take taps (#873). Only while the fighter itself is
   *  a target: the body stands over the space behind it, so otherwise a tap
   *  there belongs to that space. */
  hitTarget?: boolean;
}

export const TableFigureSprite = ({ figure, baseDiamPx, plateW, plateH, hitTarget = false }: TableFigureSpriteProps) => {
  const box = figureSpriteBox(figure, baseDiamPx);
  const aboveFeet = Math.min(box.height, -box.top + SEAM_OVERLAP_PX);
  return (
    <Box
      position="absolute"
      pointerEvents="none"
      style={{
        overflow: "hidden",
        width: `${box.width}px`,
        height: `${aboveFeet}px`,
        left: `${plateW / 2 + box.left}px`,
        top: `${plateH + box.top}px`,
      }}
    >
      <Box
        as="img"
        data-table-figure=""
        src={figure.url}
        alt=""
        draggable={false}
        position="absolute"
        maxW="none"
        pointerEvents={hitTarget ? "auto" : "none"}
        style={{ width: `${box.width}px`, height: `${box.height}px`, left: 0, top: 0 }}
      />
    </Box>
  );
};

export interface TableFigureGroundProps {
  figure: Figure;
  /** Same as the sprite's: the in-plane base disc's diameter, px. */
  baseDiamPx: number;
  /** The board's tilt — the render's camera angle, for a figure whose
   *  manifest entry does not state its own (`figureGroundSlice`). */
  tiltDeg: number;
  /** The same highlight filter as the upright half, so both glow together. */
  filter?: string;
}

/** The front of the miniature's base, lying on the board (see file header). */
export const TableFigureGround = ({ figure, baseDiamPx, tiltDeg, filter }: TableFigureGroundProps) => {
  const slice = figureGroundSlice(figureSpriteBox(figure, baseDiamPx), tiltDeg, figure.elevDeg);
  if (!slice) return null;
  return (
    <Box
      position="absolute"
      filter={filter}
      style={{
        overflow: "hidden",
        left: `${slice.left}px`,
        top: `${-SEAM_OVERLAP_PX}px`,
        width: `${slice.width}px`,
        height: `${slice.height + SEAM_OVERLAP_PX}px`,
      }}
    >
      <Box
        as="img"
        data-table-figure-ground=""
        src={figure.url}
        alt=""
        draggable={false}
        position="absolute"
        maxW="none"
        style={{
          left: 0,
          top: `${slice.imageTop + SEAM_OVERLAP_PX}px`,
          width: `${slice.width}px`,
          height: `${slice.imageHeight}px`,
        }}
      />
    </Box>
  );
};
