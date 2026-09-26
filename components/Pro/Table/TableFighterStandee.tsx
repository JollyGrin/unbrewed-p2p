/**
 * A HERO on the table. With a miniature (lib/pro/figures) it stands upright
 * on its base; without one it is the deck's own round token — the author's
 * piece, the same circle the flat board draws — lying flat on its space like
 * a sidekick (see TableFlatToken). The owner asked for exactly that
 * (2026-09-23): the portrait cut into an upright silhouette this used to draw
 * read as neither the author's piece nor a figure.
 *
 * Everything about WHERE and how big this renders — position, billboard
 * counter-rotation, depth scale, stacking order, contact shadow — is
 * `TableStandeeAnchor` + tableProjection.ts; this file only draws the piece
 * and its badges.
 */
import { Box } from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import type { FighterId, ViewFighter } from "@/lib/pro/protocol";
import type { FlagTokenBadge } from "@/lib/pro/heroStateFlags";
import { fighterStatusBadgesFor } from "@/lib/pro/fighterStatuses";
import { flatTokenTopPx, standeeBaseDiameterPx } from "@/lib/pro/tableProjection";
import type { Figure } from "@/lib/pro/figures";
import { TableFigureGround, TableFigureSprite } from "./TableFigureSprite";
import { TableAnchorAnim, TableStandeeAnchor, type TableStackDepth } from "./TableStandeeAnchor";
import {
  fighterBadgesLowestPx,
  flagBadgeLowestPx,
  pickMarksLowestPx,
  statusRowLowestPx,
  TableFighterBadges,
  TableFighterFlagBadge,
  TableFighterPickMarks,
  TableFighterStatusBadges,
} from "./TableFighterBadges";
import { TableFlatToken, TOKEN_BADGE_PLATE_HEIGHT } from "./TableFlatToken";

/** A miniature's upright plate, which anchors its badges: taller than wide,
 *  like the figure standing in it (the figure itself overflows it freely). */
const PLATE_ASPECT = 1.5;
/** That plate's width as a multiple of the space's own printed diameter. */
const PLATE_WIDTH_FACTOR = 1.55;

/**
 * Highlight for a miniature. It is a `filter`, not a `box-shadow`, so the
 * glow hugs the model's own outline rather than its image's rectangle.
 */
const plateFilter = (selected: boolean, friendly: boolean): string => {
  const depth = "drop-shadow(0 4px 8px rgba(0,0,0,0.65))";
  if (selected) return `drop-shadow(0 0 2px #fff) drop-shadow(0 0 5px #fff) ${depth}`;
  if (friendly) return `drop-shadow(0 0 2px #39B7A8) drop-shadow(0 0 5px #39B7A8) ${depth}`;
  return depth;
};

const targetPulse = keyframes`
  0%, 100% { filter: drop-shadow(0 0 3px rgba(224,168,46,0.95)) drop-shadow(0 0 6px rgba(224,168,46,0.7)) drop-shadow(0 4px 8px rgba(0,0,0,0.65)); }
  50% { filter: drop-shadow(0 0 3px rgba(224,168,46,0.45)) drop-shadow(0 0 6px rgba(224,168,46,0.25)) drop-shadow(0 4px 8px rgba(0,0,0,0.65)); }
`;

export interface TableFighterStandeeProps {
  /** Forwarded to the anchor's root — see TableStandeeAnchor's own note. */
  innerRef?: (el: HTMLElement | null) => void;
  fighter: ViewFighter;
  x: number;
  y: number;
  tiltDeg: number;
  /** Set when this piece shares its space — see TableStandeeAnchor. */
  stack?: TableStackDepth;
  diamPx: number;
  playerColor: string;
  artUrl?: string | null;
  badge?: FlagTokenBadge | null;
  badgeNumber?: number;
  selected: boolean;
  targetable: boolean;
  friendly: boolean;
  extendedReach: boolean;
  chipText?: string | null;
  /** A just-committed move to glide through (deferred-item pendingMove
   *  tweening) — passed straight to the anchor. Absent/null = static. */
  anim?: TableAnchorAnim | null;
  onAnimComplete?: () => void;
  onClick?: (id: FighterId) => void;
  onSpaceFallbackClick?: () => void;
  onHoverChange?: (id: FighterId | null) => void;
  /** A pre-rendered miniature for this hero in this seat's tint (see
   *  lib/pro/figures). When set it replaces the token-art plate; badges,
   *  glow and picking are unchanged. */
  figure?: Figure | null;
  /** How much larger than a one-space miniature to draw `figure` — a LARGE
   *  fighter's straddles its two spaces (lib/pro/figures LARGE_FIGURE_SCALE). */
  figureScale?: number;
  /** Stand without a base of its own: the piece is placed BETWEEN two spaces
   *  and each of them draws its own (see TableBoard's LARGE figures). */
  baseHidden?: boolean;
  /** Some space on the board is a pick right now. A miniature's upright body
   *  stands over the spaces BEHIND it, so while any space can be tapped the
   *  body passes taps through and the fighter is reached by its base (#873). */
  spacePicksLive?: boolean;
  /** The table plane's size — lets the badge layer stay on its pixels while
   *  it slides clear of the token (see TableStandeeAnchor's `badges`). */
  frameW?: number;
  frameH?: number;
}

export const TableFighterStandee = ({
  fighter,
  x,
  y,
  tiltDeg,
  stack,
  diamPx,
  playerColor,
  artUrl,
  badge,
  badgeNumber,
  selected,
  targetable,
  friendly,
  extendedReach,
  chipText,
  anim = null,
  onAnimComplete,
  onClick,
  onSpaceFallbackClick,
  onHoverChange,
  innerRef,
  figure = null,
  figureScale = 1,
  baseHidden = false,
  spacePicksLive = false,
  frameW,
  frameH,
}: TableFighterStandeeProps) => {
  const tokenPx = standeeBaseDiameterPx(diamPx);
  // A miniature's plate is tall; a flat token's is a low strip that only
  // lifts its badges above the token's rim.
  const widthPx = figure ? diamPx * PLATE_WIDTH_FACTOR : tokenPx;
  const heightPx = figure ? widthPx * PLATE_ASPECT : tokenPx * TOKEN_BADGE_PLATE_HEIGHT;
  const statusBadges = fighterStatusBadgesFor(fighter);
  const fighterClickable = targetable && !!onClick;
  const clickHandler = fighterClickable ? () => onClick!(fighter.id) : onSpaceFallbackClick;
  const figureBaseDiamPx = tokenPx * figureScale;
  const badgeLowestPx = Math.min(
    fighterBadgesLowestPx(heightPx, "hero"),
    pickMarksLowestPx({ extendedReach, badgeNumber, chipText }),
    badge ? flagBadgeLowestPx(heightPx) : Infinity,
    statusBadges.length > 0 ? statusRowLowestPx() : Infinity
  );

  return (
    <TableStandeeAnchor
      badgeOwner={fighter.id}
      stack={stack}
      innerRef={innerRef}
      x={x}
      y={y}
      tiltDeg={tiltDeg}
      widthPx={widthPx}
      heightPx={heightPx}
      // The base is derived from the SPACE's own footprint (`diamPx`), never
      // from the plate, so it stays concentric with the space (phase-5 #2).
      // A flat token is its own base.
      spaceDiamPx={diamPx}
      spaceId={fighter.space}
      baseAccent={playerColor}
      base={!!figure && !baseHidden}
      ground={
        figure ? (
          <TableFigureGround
            figure={figure}
            baseDiamPx={figureBaseDiamPx}
            tiltDeg={tiltDeg}
            filter={plateFilter(selected, friendly)}
          />
        ) : (
          <TableFlatToken
            sizePx={tokenPx}
            rim={playerColor}
            spaceId={fighter.space}
            name={fighter.name}
            artUrl={artUrl}
            selected={selected}
            targetable={targetable}
            friendly={friendly}
            faceAttrs={{ "data-fighter-id": fighter.id }}
          />
        )
      }
      anim={anim}
      onAnimComplete={onAnimComplete}
      pick={fighterClickable}
      onClick={clickHandler}
      onMouseEnter={onHoverChange ? () => onHoverChange(fighter.id) : undefined}
      onMouseLeave={onHoverChange ? () => onHoverChange(null) : undefined}
      title={`${fighter.name} — ${fighter.hp}/${fighter.maxHp} HP`}
      frameW={frameW}
      frameH={frameH}
      // A miniature stands on a flat base; a flat token is its own layers.
      groundTopPx={figure ? 0 : flatTokenTopPx(tokenPx)}
      badgeLowestPx={badgeLowestPx}
      badges={
        <>
          {/* Offset outside the plate's edges, like the flat board's. */}
          <TableFighterBadges fighter={fighter} size="hero" />
          <TableFighterPickMarks
            extendedReach={extendedReach}
            badgeNumber={badgeNumber}
            chipText={chipText}
            playerColor={playerColor}
          />
          {badge && <TableFighterFlagBadge badge={badge} />}
          {statusBadges.length > 0 && <TableFighterStatusBadges badges={statusBadges} />}
        </>
      }
    >
      {figure && (
        <Box
          position="relative"
          w="100%"
          h="100%"
          filter={plateFilter(selected, friendly)}
          animation={targetable && !selected ? `${targetPulse} 1.4s ease-in-out infinite` : undefined}
          sx={{ "@media (prefers-reduced-motion: reduce)": { animation: "none" } }}
          data-fighter-id={fighter.id}
        >
          <TableFigureSprite
            figure={figure}
            baseDiamPx={figureBaseDiamPx}
            plateW={widthPx}
            plateH={heightPx}
            hitTarget={fighterClickable && !spacePicksLive}
          />
        </Box>
      )}

    </TableStandeeAnchor>
  );
};
