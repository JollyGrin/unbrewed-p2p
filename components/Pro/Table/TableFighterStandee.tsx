/**
 * A HERO's standee: an upright, framed portrait plate — the "good-looking
 * fallback, never a copied asset" the brief asks for when no real cardboard
 * cut-out art exists in this project (it doesn't; `fighterTokenArt` is the
 * same circular token art the flat board already uses, resolved by the
 * caller exactly the way `useProCardArt.resolveFighterToken` always has).
 * Standing it up as a plate rather than clipping it to a circle (the flat
 * board's own shape) is what reads as "a figure on the table" instead of
 * "a chip lying on the table".
 *
 * Everything about WHERE and how big this renders — position, billboard
 * counter-rotation, depth scale, stacking order, contact shadow — is
 * `TableStandeeAnchor` + tableProjection.ts; this file only draws the plate's
 * face and its badges.
 */
import { Box, Flex, Text } from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import type { FighterId, ViewFighter } from "@/lib/pro/protocol";
import type { FlagTokenBadge } from "@/lib/pro/heroStateFlags";
import { fighterStatusBadgesFor } from "@/lib/pro/fighterStatuses";
import { tokenInitials } from "@/components/Pro/FighterTokenPortrait";
import { standeeSilhouettePath } from "@/lib/pro/tableProjection";
import { TableAnchorAnim, TableStandeeAnchor } from "./TableStandeeAnchor";
import { TableFighterBadges } from "./TableFighterBadges";

/** Plate proportions — noticeably TALLER than it is wide, so a standee reads
 *  as a figure standing on a space, not a token the same size as the space
 *  it occupies (phase-3 "Size" requirement). */
const PLATE_ASPECT = 1.5;
/** Plate width as a multiple of the space's own printed diameter (px) — wider
 *  than the flat board's circular token so a portrait plate doesn't feel
 *  cramped standing on the same footprint. */
const PLATE_WIDTH_FACTOR = 1.55;

/**
 * SILHOUETTE MASK (phase-3 fault #1 — the plate still read as a rectangle).
 * Phase 2's fix was a `border-radius` arch: it rounds the box's CORNERS, but
 * every SIDE stayed a dead-straight vertical line, and a hard 2px owner-color
 * border traced that same rectangle on top. At the tens-of-pixels a standee
 * actually renders at, that reads as "a rounded ID card", not "a figure".
 *
 * `clip-path: path(...)` replaces it with `standeeSilhouettePath` — a real,
 * non-rectangular outline (domed head, tapered waist, flared feet; see
 * tableProjection.ts) computed at THIS plate's own render size, so the mask
 * scales correctly whatever `widthPx`/`heightPx` the caller passes. The hard
 * owner-color border is gone entirely: ownership now reads off the STANDEE
 * BASE's rim (TableStandeeAnchor), exactly like a real cardboard standee
 * slotted into a colored plastic base — the figure itself needs no border.
 *
 * `clip-path` also clips ordinary `box-shadow` (it lies outside the clipped
 * silhouette, so it would vanish rather than outline it), which is why the
 * selection/target/depth cues below are `filter: drop-shadow(...)` instead —
 * a `filter` runs on the element's already-clipped, rasterized output, so it
 * hugs the actual silhouette edge rather than the box's rectangular bounds.
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
}: TableFighterStandeeProps) => {
  const widthPx = diamPx * PLATE_WIDTH_FACTOR;
  const heightPx = widthPx * PLATE_ASPECT;
  const statusBadges = fighterStatusBadgesFor(fighter);
  const fighterClickable = targetable && !!onClick;
  const clickHandler = fighterClickable ? () => onClick!(fighter.id) : onSpaceFallbackClick;
  // Computed at THIS plate's own render size (see standeeSilhouettePath's own
  // comment on why it needs actual px, not a percentage) — every hero on the
  // board gets the identical silhouette, just scaled to its own diamPx.
  const clipPath = `path('${standeeSilhouettePath(widthPx, heightPx)}')`;

  return (
    <TableStandeeAnchor
      x={x}
      y={y}
      tiltDeg={tiltDeg}
      widthPx={widthPx}
      heightPx={heightPx}
      // Wider than the silhouette's own flared feet (STANDEE_FOOT_HALF_WIDTH
      // * 2 = 0.76 of the plate's width — see tableProjection.ts) by a clear
      // margin, so the base unmistakably reads as something the figure is
      // STANDING ON rather than merely a same-size shadow under it.
      shadowWidthFactor={0.88}
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
        style={{ clipPath }}
        bg="radial-gradient(circle at 50% 30%, #3d2249 0%, var(--chakra-colors-brand-surfaceDim) 80%)"
        filter={plateFilter(selected, friendly)}
        animation={targetable && !selected ? `${targetPulse} 1.4s ease-in-out infinite` : undefined}
        sx={{ "@media (prefers-reduced-motion: reduce)": { animation: "none" } }}
        data-fighter-id={fighter.id}
      >
        {artUrl ? (
          <>
            <Box
              as="img"
              src={artUrl}
              alt=""
              draggable={false}
              position="absolute"
              inset={0}
              w="100%"
              h="100%"
              sx={{ objectFit: "cover", objectPosition: "center top" }}
            />
            <Box
              position="absolute"
              inset={0}
              bg="linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)"
            />
          </>
        ) : (
          <Box position="absolute" inset={0} display="flex" alignItems="center" justifyContent="center">
            <Text fontFamily="BebasNeueRegular" fontSize="1.4rem" color="brand.parchment">
              {tokenInitials(fighter.name)}
            </Text>
          </Box>
        )}
      </Box>

      {/* Everything below is a SIBLING of the clipped face box above, not a
          child of it — `clip-path` clips an element's entire painted
          subtree, so a badge that needs to survive OUTSIDE the silhouette
          (the dome's cut-off top corners, in particular) has to live here
          instead. The HP heart / reach glyph (TableFighterBadges), the
          extended-reach chip and the identity-number chip all follow this
          same "sibling, offset outside the plate's own edge" pattern the HP
          badge already used before this phase. */}
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
