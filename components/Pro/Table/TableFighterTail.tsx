/**
 * The TRAILING body-space of a LARGE (two-space) fighter — deferred item from
 * the phase-1 report: "only the head renders today". A LARGE fighter's tail
 * is deliberately a PLAIN colored circle, not a second portrait — that is
 * ProBoard's own convention (its `fighterToken` renders art, the HP badge and
 * every status only on the `segment === "head"` pass) and this mirrors it, so
 * a two-space fighter never looks like two independent characters.
 *
 * Billboarded like every other standee (TableStandeeAnchor), so the tail
 * stands upright on its own base exactly like the head does.
 */
import { Box } from "@chakra-ui/react";
import type { FighterId, ViewFighter } from "@/lib/pro/protocol";
import { TableAnchorAnim, TableStandeeAnchor } from "./TableStandeeAnchor";

/** A tail token's footprint, as a multiple of the space's own printed
 *  diameter (px) — the same size class as a sidekick token, since visually a
 *  LARGE fighter's tail is "a big plain circle", not a plate. */
const TAIL_WIDTH_FACTOR = 1.15;

export interface TableFighterTailProps {
  fighter: ViewFighter;
  x: number;
  y: number;
  tiltDeg: number;
  diamPx: number;
  playerColor: string;
  selected: boolean;
  anim?: TableAnchorAnim | null;
  onAnimComplete?: () => void;
  /** The tail forwards a click to the SAME fighter id as the head — clicking
   *  either segment acts on the whole fighter, matching ProBoard. */
  onClick?: (id: FighterId) => void;
  targetable: boolean;
}

export const TableFighterTail = ({
  fighter,
  x,
  y,
  tiltDeg,
  diamPx,
  playerColor,
  selected,
  anim = null,
  onAnimComplete,
  onClick,
  targetable,
}: TableFighterTailProps) => {
  const sizePx = diamPx * TAIL_WIDTH_FACTOR;
  const clickable = targetable && !!onClick;

  return (
    <TableStandeeAnchor
      x={x}
      y={y}
      tiltDeg={tiltDeg}
      widthPx={sizePx}
      heightPx={sizePx}
      // Base derived from the space's own footprint, not this token's own
      // (slightly larger, `TAIL_WIDTH_FACTOR`) size — phase-5 target #2.
      spaceDiamPx={diamPx}
      baseAccent={playerColor}
      anim={anim}
      onAnimComplete={onAnimComplete}
      pick={clickable}
      onClick={clickable ? () => onClick!(fighter.id) : undefined}
      title={`${fighter.name} (trailing body)`}
      data-fighter-id={`${fighter.id}-tail`}
    >
      <Box
        position="relative"
        w="100%"
        h="100%"
        borderRadius="50%"
        bg={playerColor}
        border="2px solid #fff"
        opacity={0.92}
        boxShadow={selected ? "0 0 0 3px #fff, 0 4px 8px rgba(0,0,0,0.6)" : "0 4px 8px rgba(0,0,0,0.6)"}
      />
    </TableStandeeAnchor>
  );
};
