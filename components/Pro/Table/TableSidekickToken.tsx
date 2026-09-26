/**
 * A SIDEKICK on the table: its deck's round token, lying flat on its space
 * (see TableFlatToken for why flat). The HP badge stands up above it.
 */
import type { FighterId, ViewFighter } from "@/lib/pro/protocol";
import { standeeBaseDiameterPx } from "@/lib/pro/tableProjection";
import { TableAnchorAnim, TableStandeeAnchor } from "./TableStandeeAnchor";
import { TableFighterBadges } from "./TableFighterBadges";
import { TableFlatToken, TOKEN_BADGE_PLATE_HEIGHT } from "./TableFlatToken";

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
  const sizePx = standeeBaseDiameterPx(diamPx);
  const fighterClickable = targetable && !!onClick;
  const clickHandler = fighterClickable ? () => onClick!(fighter.id) : onSpaceFallbackClick;

  return (
    <TableStandeeAnchor
      x={x}
      y={y}
      tiltDeg={tiltDeg}
      widthPx={sizePx}
      heightPx={sizePx * TOKEN_BADGE_PLATE_HEIGHT}
      spaceDiamPx={diamPx}
      spaceId={fighter.space}
      baseAccent={playerColor}
      base={false}
      ground={
        <TableFlatToken
          sizePx={sizePx}
          rim={playerColor ?? "rgba(250, 240, 222, 0.55)"}
          spaceId={fighter.space}
          name={fighter.name}
          artUrl={artUrl}
          selected={selected}
          targetable={targetable}
          friendly={friendly}
          faceAttrs={{ "data-fighter-id": fighter.id }}
        />
      }
      anim={anim}
      onAnimComplete={onAnimComplete}
      pick={fighterClickable}
      onClick={clickHandler}
      onMouseEnter={onHoverChange ? () => onHoverChange(fighter.id) : undefined}
      onMouseLeave={onHoverChange ? () => onHoverChange(null) : undefined}
      title={`${fighter.name} — ${fighter.hp}/${fighter.maxHp} HP`}
    >
      <TableFighterBadges fighter={fighter} size="sidekick" />
    </TableStandeeAnchor>
  );
};
