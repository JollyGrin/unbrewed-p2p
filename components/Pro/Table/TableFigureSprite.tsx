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
 * The render already contains the base drawn at roughly the table camera's
 * angle (40°), so the in-plane base disc under it reads as the seat-colored
 * rim of the miniature's own base rather than a second, separate disc.
 */
import { Box } from "@chakra-ui/react";
import { Figure, figureSpriteBox } from "@/lib/pro/figures";

export interface TableFigureSpriteProps {
  figure: Figure;
  /** Diameter of the standee's in-plane base disc, px. */
  baseDiamPx: number;
  /** The billboarded plate's own size, px — its bottom centre is the feet. */
  plateW: number;
  plateH: number;
}

export const TableFigureSprite = ({ figure, baseDiamPx, plateW, plateH }: TableFigureSpriteProps) => {
  const box = figureSpriteBox(figure, baseDiamPx);
  return (
    <Box
      as="img"
      data-table-figure=""
      src={figure.url}
      alt=""
      draggable={false}
      position="absolute"
      maxW="none"
      pointerEvents="none"
      style={{
        width: `${box.width}px`,
        height: `${box.height}px`,
        left: `${plateW / 2 + box.left}px`,
        top: `${plateH + box.top}px`,
      }}
    />
  );
};
