/**
 * A SIDEKICK on the table: a round cardboard token with its portrait, lying
 * FLAT on its space, a few layers thick.
 *
 * WHY FLAT. It used to stand upright like the heroes, as a billboarded disc.
 * A disc touches the board in a single point, so it read as a balloon
 * hovering over its space; once the heroes became miniatures standing on
 * their bases, the owner saw the sidekicks as "not standing on their spaces"
 * (2026-09-23). A token lying on the space is exactly what a cardboard
 * sidekick token is, and it cannot sit anywhere but on its space: it is the
 * base, the same size and centre as the base disc a hero stands on. The HP
 * badge still stands up above it (an empty billboard carries it), so it reads
 * from the camera like every other badge.
 *
 * Reuses `FighterTokenPortrait` (the same clipped art-or-initials circle the
 * hero-preview modal already draws) for the face, so a sidekick's look can
 * never drift from what the rest of the app shows for it.
 */
import { Box } from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import type { FighterId, ViewFighter } from "@/lib/pro/protocol";
import { FighterTokenPortrait } from "@/components/Pro/FighterTokenPortrait";
import { standeeBaseDiameterPx } from "@/lib/pro/tableProjection";
import { TableAnchorAnim, TableStandeeAnchor } from "./TableStandeeAnchor";
import { TableFighterBadges } from "./TableFighterBadges";

/** The token's thickness as a fraction of its diameter — about a 2mm board
 *  on a 25mm token. It is drawn as a stack of layers, one px apart. */
const TOKEN_THICKNESS = 0.08;
/** Height of the empty upright plate that carries the badges, as a fraction
 *  of the token's diameter: it puts the HP heart just above the token's rim. */
const BADGE_PLATE_HEIGHT = 0.6;
/** The token's side, seen between its layers: the board's own dark ink. */
const TOKEN_EDGE_FILL = "#1b0f1f";

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
  const sizePx = standeeBaseDiameterPx(diamPx);
  const rim = playerColor ?? "rgba(250, 240, 222, 0.55)";
  const layers = Math.max(1, Math.round(sizePx * TOKEN_THICKNESS));
  const fighterClickable = targetable && !!onClick;
  const clickHandler = fighterClickable ? () => onClick!(fighter.id) : onSpaceFallbackClick;
  const disc = (z: number) => `translate(-50%, -50%) translateZ(${z}px)`;

  const token = (
    <Box position="absolute" left={0} top={0} style={{ transformStyle: "preserve-3d" }}>
      {/* The side: identical discs from the board up, the bottom one being
          the piece's base for the visual probe (it lies exactly on the
          board, concentric with the space). */}
      {Array.from({ length: layers }, (_, i) => (
        <Box
          key={i}
          position="absolute"
          borderRadius="50%"
          bg={TOKEN_EDGE_FILL}
          boxShadow={i === 0 ? "0 2px 5px rgba(0,0,0,0.7)" : undefined}
          style={{
            width: `${sizePx}px`,
            height: `${sizePx}px`,
            border: "2px solid",
            borderColor: rim,
            transform: disc(i),
          }}
          data-fighter-base={i === 0 ? "" : undefined}
          data-space-id={i === 0 ? fighter.space ?? undefined : undefined}
        />
      ))}
      <Box
        position="absolute"
        borderRadius="50%"
        pointerEvents="auto"
        boxShadow={
          selected ? "0 0 0 3px #fff" : friendly ? "0 0 0 2px #39B7A8" : undefined
        }
        animation={targetable && !selected ? `${targetPulse} 1.4s ease-in-out infinite` : undefined}
        sx={{ "@media (prefers-reduced-motion: reduce)": { animation: "none" } }}
        style={{
          width: `${sizePx}px`,
          height: `${sizePx}px`,
          border: "2px solid",
          borderColor: rim,
          overflow: "hidden",
          transform: disc(layers),
        }}
        data-fighter-id={fighter.id}
      >
        <FighterTokenPortrait name={fighter.name} artUrl={artUrl} size={`${sizePx - 4}px`} />
      </Box>
    </Box>
  );

  return (
    <TableStandeeAnchor
      x={x}
      y={y}
      tiltDeg={tiltDeg}
      widthPx={sizePx}
      heightPx={sizePx * BADGE_PLATE_HEIGHT}
      spaceDiamPx={diamPx}
      spaceId={fighter.space}
      baseAccent={playerColor}
      base={false}
      ground={token}
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
