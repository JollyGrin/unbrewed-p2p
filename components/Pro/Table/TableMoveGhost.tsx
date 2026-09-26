/**
 * The walk / effect-move preview ghost on the table (issue #285 on the flat
 * board, #871 here): where the stepping fighter's walk ends NOW, while the
 * player is still choosing hops. Nothing has been sent yet, so the real piece
 * stays on its space and this translucent stand-in marks the end of the route.
 *
 * It looks like ProBoard's ghost translated to the table: a dashed,
 * see-through token lying flat on the end space (the piece's footprint), with
 * the fighter's initials standing up above it so it reads from any tilt. A
 * LARGE body draws one of these on each of its two landing spaces.
 *
 * Inert: every tap falls through to the gold step highlight underneath, so the
 * player can keep stepping onto (or commit from) the ghost's own space.
 */
import { Box, Text } from "@chakra-ui/react";
import { standeeBaseDiameterPx } from "@/lib/pro/tableProjection";
import { TableStandeeAnchor } from "./TableStandeeAnchor";

export interface TableMoveGhostProps {
  fighterId: string;
  /** "lead" = where the fighter ends; "trail" = a LARGE body's second space. */
  end: "lead" | "trail";
  x: number;
  y: number;
  spaceId: string;
  tiltDeg: number;
  diamPx: number;
  color: string;
  initials: string;
  isHero: boolean;
}

export const TableMoveGhost = ({
  fighterId,
  end,
  x,
  y,
  spaceId,
  tiltDeg,
  diamPx,
  color,
  initials,
  isHero,
}: TableMoveGhostProps) => {
  const sizePx = standeeBaseDiameterPx(diamPx);
  return (
    <TableStandeeAnchor
      x={x}
      y={y}
      tiltDeg={tiltDeg}
      widthPx={sizePx}
      heightPx={sizePx * 0.6}
      spaceDiamPx={diamPx}
      base={false}
      inert
      title="move preview — click a gold space to keep stepping, or commit to finish"
      data-move-ghost={end}
      data-ghost-fighter-id={fighterId}
      data-ghost-space-id={spaceId}
      ground={
        <Box
          position="absolute"
          borderRadius="50%"
          bg={isHero ? color : "brand.surfaceDim"}
          border={`2px dashed ${isHero ? "#fff" : color}`}
          opacity={0.55}
          style={{ width: `${sizePx}px`, height: `${sizePx}px`, transform: "translate(-50%, -50%) translateZ(1px)" }}
        />
      }
    >
      {end === "lead" && (
        <Text
          position="absolute"
          bottom={0}
          left="50%"
          transform="translateX(-50%)"
          fontSize="0.68rem"
          fontWeight="bold"
          letterSpacing="-0.02em"
          color="brand.parchment"
          bg="rgba(20,8,24,0.7)"
          border={`1.5px dashed ${color}`}
          borderRadius="999px"
          px="0.3em"
          lineHeight={1.2}
          whiteSpace="nowrap"
          userSelect="none"
          opacity={0.9}
        >
          {initials}
        </Text>
      )}
    </TableStandeeAnchor>
  );
};
