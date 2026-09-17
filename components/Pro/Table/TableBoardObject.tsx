/**
 * A neutral board object (protocol v26 — totems, corpses) on the tabletop
 * view. Non-interactive, kind-driven via the SAME `BOARD_OBJECT_VISUALS`
 * registry ProBoard reads, so a new kind added there needs no change here
 * either. Small and billboarded like a sidekick token, since a totem/corpse
 * is a standing thing on the board, not a flat marker.
 */
import { Box } from "@chakra-ui/react";
import type { ViewToken } from "@/lib/pro/protocol";
import { BOARD_OBJECT_VISUALS, UNKNOWN_OBJECT } from "@/lib/pro/boardObjects";
import { TableStandeeAnchor } from "./TableStandeeAnchor";

/** A board object's footprint, smaller than even a sidekick's. */
const OBJECT_WIDTH_FACTOR = 0.85;

export interface TableBoardObjectProps {
  token: ViewToken;
  x: number;
  y: number;
  tiltDeg: number;
  diamPx: number;
  playerColor: string;
  artUrl?: string | null;
  originName?: string | null;
}

export const TableBoardObject = ({
  token,
  x,
  y,
  tiltDeg,
  diamPx,
  playerColor,
  artUrl,
  originName,
}: TableBoardObjectProps) => {
  const visual = BOARD_OBJECT_VISUALS[token.kind] ?? UNKNOWN_OBJECT;
  const sizePx = diamPx * OBJECT_WIDTH_FACTOR;
  const title = `${visual.label}${originName ? ` — ${originName}` : ""}`;

  return (
    <TableStandeeAnchor
      x={x}
      y={y}
      tiltDeg={tiltDeg}
      widthPx={sizePx}
      heightPx={sizePx}
      // Base derived from the space's own footprint, not this object's own
      // (slightly smaller, `OBJECT_WIDTH_FACTOR`) size — phase-5 target #2.
      spaceDiamPx={diamPx}
      spaceId={token.space}
      baseAccent={playerColor}
      title={title}
    >
      <Box
        position="relative"
        w="100%"
        h="100%"
        borderRadius={visual.shape === "disc" ? "50%" : "0.15rem"}
        transform={visual.shape === "diamond" ? "rotate(45deg)" : undefined}
        overflow="hidden"
        border="2px solid"
        borderColor={playerColor}
        bg="radial-gradient(circle at 50% 30%, #3d2249 0%, var(--chakra-colors-brand-surfaceDim) 80%)"
        filter={visual.muted ? "grayscale(1) brightness(0.6)" : undefined}
        boxShadow="0 3px 8px rgba(0,0,0,0.6)"
      >
        {artUrl ? (
          <Box
            as="img"
            src={artUrl}
            alt=""
            draggable={false}
            position="absolute"
            inset={0}
            w="100%"
            h="100%"
            transform={visual.shape === "diamond" ? "rotate(-45deg) scale(1.42)" : undefined}
            sx={{ objectFit: "cover", objectPosition: "center top" }}
          />
        ) : (
          <Box
            position="absolute"
            inset={0}
            display="flex"
            alignItems="center"
            justifyContent="center"
            transform={visual.shape === "diamond" ? "rotate(-45deg)" : undefined}
            fontSize="0.9rem"
          >
            {visual.glyph}
          </Box>
        )}
      </Box>
    </TableStandeeAnchor>
  );
};
