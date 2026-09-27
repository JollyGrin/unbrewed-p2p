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
import { flatTokenTopPx, placeStandee, standeeBaseDiameterPx } from "@/lib/pro/tableProjection";
import { figureSilhouetteBox, type Figure } from "@/lib/pro/figures";
import type { Mini3d } from "@/lib/pro/minis3d/manifest";
import type { TableRig } from "@/lib/pro/minis3d/camera";
import { standingPose } from "@/lib/pro/minis3d/pose";
import { mini3dPlateSize, TableMini3D, useTableMini3d } from "./TableMini3D";
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

/**
 * The upright plate that anchors a hero's badges, px: its bottom centre is the
 * feet, its top corners are where the HP/reach column and the flag hang.
 *
 * A miniature's plate is the box its OWN silhouette fills (#928) — one generic
 * tall plate for every model left the badges floating far above a squat or
 * wide one. It is never smaller than the flat token's low strip, so a model
 * lower than its own base still carries its badges above the rim. A flat
 * token's plate is that strip.
 */
export const heroPlateSize = (
  figure: Figure | null,
  tokenPx: number,
  figureBaseDiamPx: number
): { widthPx: number; heightPx: number } => {
  const strip = { widthPx: tokenPx, heightPx: tokenPx * TOKEN_BADGE_PLATE_HEIGHT };
  if (!figure) return strip;
  const silhouette = figureSilhouetteBox(figure, figureBaseDiamPx);
  return {
    widthPx: Math.max(strip.widthPx, 2 * silhouette.halfWidth),
    heightPx: Math.max(strip.heightPx, silhouette.height),
  };
};

/**
 * Highlight for a miniature. It is a `filter`, not a `box-shadow`, so the
 * glow hugs the model's own outline rather than its image's rectangle.
 */
export const plateFilter = (selected: boolean, friendly: boolean): string => {
  const depth = "drop-shadow(0 4px 8px rgba(0,0,0,0.65))";
  if (selected) return `drop-shadow(0 0 2px #fff) drop-shadow(0 0 5px #fff) ${depth}`;
  if (friendly) return `drop-shadow(0 0 2px #39B7A8) drop-shadow(0 0 5px #39B7A8) ${depth}`;
  return depth;
};

export const targetPulse = keyframes`
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
  /** A real 3D model to stand here instead of `figure`'s sprite (#945; the
   *  "3D minis" figure style, #953), drawn for the CSS camera `rig`. Falls
   *  back to the sprite (or token) while it loads and whenever WebGL is
   *  unavailable or lost. */
  mini3d?: Mini3d | null;
  rig?: TableRig | null;
  /** Canvas pixel-ratio cap for the 3D mini (dev switch `?minis3dDpr=`). */
  mini3dMaxPixelRatio?: number | null;
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
  figure: spriteFigure = null,
  figureScale = 1,
  baseHidden = false,
  spacePicksLive = false,
  frameW,
  frameH,
  mini3d = null,
  rig = null,
  mini3dMaxPixelRatio = null,
}: TableFighterStandeeProps) => {
  // A 3D mini only while the shared renderer is up and the model decoded;
  // otherwise exactly the sprite/token path below.
  const model3d = useTableMini3d(mini3d, rig);
  const use3d = !!model3d;
  const figure = use3d ? null : spriteFigure;
  const tokenPx = standeeBaseDiameterPx(diamPx);
  const figureBaseDiamPx = tokenPx * figureScale;
  const upright = !!figure || use3d;
  const groundScale = placeStandee(stack ? stack.depthY : y, tiltDeg).scale;
  // A 3D mini's badges hang off the model's own projected bounds (#929).
  const strip = heroPlateSize(null, tokenPx, figureBaseDiamPx);
  const { widthPx, heightPx } = use3d
    ? mini3dPlateSize(model3d, mini3d!, rig!, standingPose(x, y), figureBaseDiamPx, groundScale, strip.widthPx, strip.heightPx)
    : heroPlateSize(figure, tokenPx, figureBaseDiamPx);
  const statusBadges = fighterStatusBadgesFor(fighter);
  const fighterClickable = targetable && !!onClick;
  const clickHandler = fighterClickable ? () => onClick!(fighter.id) : onSpaceFallbackClick;
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
      base={upright && !baseHidden}
      ground={
        use3d ? (
          <TableMini3D
            mini={mini3d!}
            model={model3d}
            rig={rig!}
            x={x}
            y={y}
            baseDiamPx={figureBaseDiamPx}
            groundScale={groundScale}
            animating={!!anim}
            filter={plateFilter(selected, friendly)}
            animation={targetable && !selected ? `${targetPulse} 1.4s ease-in-out infinite` : undefined}
            hitTarget={fighterClickable && !spacePicksLive}
            maxPixelRatio={mini3dMaxPixelRatio}
            canvasAttrs={{ "data-fighter-id": fighter.id }}
          />
        ) : figure ? (
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
      groundTopPx={upright ? 0 : flatTokenTopPx(tokenPx)}
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
