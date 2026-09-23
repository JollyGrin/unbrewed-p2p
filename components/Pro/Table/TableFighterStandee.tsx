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
import { Box, Flex, Text } from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import type { FighterId, ViewFighter } from "@/lib/pro/protocol";
import type { FlagTokenBadge } from "@/lib/pro/heroStateFlags";
import { fighterStatusBadgesFor } from "@/lib/pro/fighterStatuses";
import { standeeBaseDiameterPx } from "@/lib/pro/tableProjection";
import type { Figure } from "@/lib/pro/figures";
import { TableFigureGround, TableFigureSprite } from "./TableFigureSprite";
import { TableAnchorAnim, TableStandeeAnchor } from "./TableStandeeAnchor";
import { TableFighterBadges } from "./TableFighterBadges";
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
}

export const TableFighterStandee = ({
  fighter,
  x,
  y,
  tiltDeg,
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

  return (
    <TableStandeeAnchor
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
          <TableFigureSprite figure={figure} baseDiamPx={figureBaseDiamPx} plateW={widthPx} plateH={heightPx} />
        </Box>
      )}

      {/* Badges stand in the upright plate, offset outside its edges. */}
      <TableFighterBadges fighter={fighter} size="hero" />

      {extendedReach && (
        <Box
          position="absolute"
          bottom="-0.35rem"
          right="-0.35rem"
          bg="rgba(56,217,232,0.9)"
          color="#0A1418"
          borderRadius="0.2rem"
          px="0.2rem"
          fontSize="0.5rem"
          fontWeight="bold"
          zIndex={2}
        >
          reach 2
        </Box>
      )}

      {badgeNumber != null && (
        <Flex
          position="absolute"
          bottom="-0.35rem"
          left="-0.35rem"
          w="1.1rem"
          h="1.1rem"
          borderRadius="50%"
          align="center"
          justify="center"
          bg="brand.surfaceDim"
          color="brand.parchment"
          border={`1.5px solid ${playerColor}`}
          fontSize="0.55rem"
          fontWeight="bold"
          zIndex={2}
        >
          {badgeNumber}
        </Flex>
      )}

      {badge && (
        <Box
          position="absolute"
          top="-0.5rem"
          left="-0.5rem"
          minW="1.4rem"
          h="1.4rem"
          px="0.15rem"
          borderRadius="999px"
          bg={badge.bg}
          color={badge.color}
          border="1.5px solid #fff"
          display="flex"
          alignItems="center"
          justifyContent="center"
          fontSize="0.6rem"
          fontWeight="bold"
          title={badge.title}
          zIndex={2}
        >
          {badge.icon}
          {badge.showLabel && <Text as="span">{badge.label}</Text>}
        </Box>
      )}

      {statusBadges.length > 0 && (
        <Box position="absolute" bottom="-0.4rem" left="50%" transform="translateX(-50%)" display="flex" gap="0.15rem" zIndex={2}>
          {statusBadges.map((sb) => (
            <Box
              key={sb.key}
              w="1.1rem"
              h="1.1rem"
              borderRadius="50%"
              bg={sb.bg}
              color={sb.color}
              border="1px solid #fff"
              display="flex"
              alignItems="center"
              justifyContent="center"
              fontSize="0.55rem"
              title={sb.title}
            >
              {sb.icon}
            </Box>
          ))}
        </Box>
      )}

      {chipText && (
        <Text
          position="absolute"
          bottom="-1.3rem"
          left="50%"
          transform="translateX(-50%)"
          whiteSpace="nowrap"
          fontSize="0.55rem"
          bg="rgba(20,8,24,0.85)"
          color="brand.highlight"
          px="0.3rem"
          borderRadius="0.2rem"
          zIndex={2}
        >
          {chipText}
        </Text>
      )}
    </TableStandeeAnchor>
  );
};
