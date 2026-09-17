/**
 * A SIDEKICK's standee: "sidekicks are round tokens with a portrait" (the
 * tabletop design brief, distinct from a hero's upright plate) — still
 * billboarded so it stands on the board rather than lying flat with it, just
 * circular and smaller. Reuses `FighterTokenPortrait` (the same clipped
 * art-or-initials circle the hero-preview modal already draws) for the face,
 * so a sidekick's look can never drift from what the rest of the app shows
 * for it.
 */
import { Box } from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import type { FighterId, ViewFighter } from "@/lib/pro/protocol";
import { FighterTokenPortrait } from "@/components/Pro/FighterTokenPortrait";
import { TableAnchorAnim, TableStandeeAnchor } from "./TableStandeeAnchor";
import { TableFighterBadges } from "./TableFighterBadges";

/** A sidekick's footprint on the table, as a multiple of the space's own
 *  printed diameter (px) — smaller than a hero's plate. */
const SIDEKICK_WIDTH_FACTOR = 1.05;

const targetPulse = keyframes`
  0%, 100% { box-shadow: 0 0 0 2.5px rgba(224,168,46,0.95); }
  50% { box-shadow: 0 0 0 2.5px rgba(224,168,46,0.45); }
`;

export interface TableSidekickTokenProps {
  fighter: ViewFighter;
  x: number;
  y: number;
  tiltDeg: number;
  diamPx: number;
  artUrl?: string | null;
  /** Owner's token color — carried onto the base disc (fault #3) so a
   *  sidekick's footprint reads as "whose piece" the same way a hero's does.
   *  Optional: an omitted color falls back to the anchor's own neutral. */
  playerColor?: string;
  selected: boolean;
  targetable: boolean;
  friendly: boolean;
  /** A just-committed move to glide through (deferred-item pendingMove
   *  tweening). Absent/null = static. */
  anim?: TableAnchorAnim | null;
  onAnimComplete?: () => void;
  onClick?: (id: FighterId) => void;
  onSpaceFallbackClick?: () => void;
  onHoverChange?: (id: FighterId | null) => void;
}

export const TableSidekickToken = ({
  fighter,
  x,
  y,
  tiltDeg,
  diamPx,
  artUrl,
  playerColor,
  selected,
  targetable,
  friendly,
  anim = null,
  onAnimComplete,
  onClick,
  onSpaceFallbackClick,
  onHoverChange,
}: TableSidekickTokenProps) => {
  const sizePx = diamPx * SIDEKICK_WIDTH_FACTOR;
  const fighterClickable = targetable && !!onClick;
  const clickHandler = fighterClickable ? () => onClick!(fighter.id) : onSpaceFallbackClick;

  return (
    <TableStandeeAnchor
      x={x}
      y={y}
      tiltDeg={tiltDeg}
      widthPx={sizePx}
      heightPx={sizePx}
      // Base derived from the space's own footprint, not this token's own
      // (slightly larger, `SIDEKICK_WIDTH_FACTOR`) size — phase-5 target #2.
      spaceDiamPx={diamPx}
      baseAccent={playerColor}
      anim={anim}
      onAnimComplete={onAnimComplete}
      pick={fighterClickable}
      onClick={clickHandler}
      onMouseEnter={onHoverChange ? () => onHoverChange(fighter.id) : undefined}
      onMouseLeave={onHoverChange ? () => onHoverChange(null) : undefined}
      title={`${fighter.name} — ${fighter.hp}/${fighter.maxHp} HP`}
    >
      <Box
        position="relative"
        w="100%"
        h="100%"
        borderRadius="50%"
        boxShadow={
          selected
            ? "0 0 0 3px #fff"
            : friendly
              ? "0 0 0 2px #39B7A8"
              : undefined
        }
        animation={targetable && !selected ? `${targetPulse} 1.4s ease-in-out infinite` : undefined}
        sx={{ "@media (prefers-reduced-motion: reduce)": { animation: "none" } }}
        data-fighter-id={fighter.id}
      >
        <FighterTokenPortrait name={fighter.name} artUrl={artUrl} size={`${sizePx}px`} />
      </Box>
      <TableFighterBadges fighter={fighter} size="sidekick" />
    </TableStandeeAnchor>
  );
};
