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
import {
  standeeArtTransform,
  standeeSilhouettePath,
  STANDEE_ART_TRANSFORM_ORIGIN,
  STANDEE_FOOT_HALF_WIDTH,
} from "@/lib/pro/tableProjection";
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

/**
 * ART FIT (phase-4 fault #2 — a correctly-shaped silhouette still looked
 * like "a picture lying on the space" because the square portrait inside it
 * was never actually fitted to it). `object-fit: cover` alone leaves the
 * source image's full height sitting in the plate untouched for this
 * aspect-ratio pairing (see `standeeArtTransform`'s own comment in
 * tableProjection.ts for the exact reason) — including whatever card
 * background sits above the character's head. `standeeArtTransform` adds
 * the extra zoom that crops that background away; this constant is its
 * `transform-origin` counterpart, imported alongside it so the two are
 * always applied as the matched pair they have to be.
 */
const artStyle = {
  objectFit: "cover" as const,
  objectPosition: "center top" as const,
  transform: standeeArtTransform(),
  transformOrigin: STANDEE_ART_TRANSFORM_ORIGIN,
};

/**
 * Bottom fade — feathers the art into the standee BASE (TableStandeeAnchor)
 * instead of ending on the silhouette's hard foot edge. Without this, the
 * clip-path's flat foot line reads as the art being SLICED off, which is
 * the opposite of "standing in a base". Deepened from the phase-3 version
 * (which only reached 55% opacity, tuned for legibility of badges near the
 * bottom, not for blending into the base) to a near-opaque tone close to the
 * base disc's own darkest stop (`rgba(8,4,10,0.95)` in TableStandeeAnchor)
 * so the two visually meet rather than jump in tone at the clip edge.
 */
const artBaseFade =
  "linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(10,5,12,0.55) 80%, rgba(8,4,10,0.9) 100%)";

/**
 * Edge vignette — darkens the art toward the silhouette's own outline. These
 * token portraits are painted on a solid card background (pale cream for
 * King Kong, forest green for Malfurion — every hero's own color, never the
 * same two colors), and `standeeArtTransform`'s crop cannot remove all of it
 * without also cropping into the character (a wide head like antlers, or
 * shoulders reaching close to the frame's own edges, can leave a sliver of
 * that background at the very edge of the plate). Rather than chase a crop
 * tight enough for every current and future hero's own framing, this
 * darkens exactly the region where any leftover background would sit — the
 * silhouette's own edge — so it reads as shadow/falloff around the figure
 * instead of as a patch of the card it was cut from. Transparent through the
 * center (over the face) so it never dims the part of the portrait doing
 * the most work to read as "a figure".
 */
const artVignette =
  "radial-gradient(ellipse 60% 55% at 50% 35%, rgba(0,0,0,0) 55%, rgba(6,3,8,0.6) 100%)";

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
      // * 2 — the widest keypoint since the phase-4 reorder, see
      // tableProjection.ts) by a clear margin, so the base unmistakably
      // reads as something the figure is STANDING ON rather than merely a
      // same-size shadow under it. Computed from the constant, not a second
      // hand-tuned literal, so the two can never drift back out of sync the
      // way they did when the silhouette's widest point moved (phase-4
      // fault #1) and this factor was left at its old, now too-narrow value.
      // +0.12 matches the same additive margin phase-3 tuned in (0.88 base
      // vs. the old foot fraction of 0.76).
      shadowWidthFactor={STANDEE_FOOT_HALF_WIDTH * 2 + 0.12}
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
              sx={artStyle}
            />
            {/* Edge vignette UNDER the base fade: both are semi-transparent
                overlays stacked on top of the art, and the vignette's own
                darkening needs to read all the way to the plate's sides,
                which the base fade (a top-to-bottom gradient only) doesn't
                touch. Order between the two doesn't change what either
                looks like on its own — they occupy different regions (edges
                vs. bottom) — but keeping the vignette first mirrors "shadow
                closest to the art, base-blend on top" from the ground up,
                the same stacking logic TableStandeeAnchor already uses for
                the contact shadow vs. the base disc beneath the figure. */}
            <Box position="absolute" inset={0} bg={artVignette} />
            <Box position="absolute" inset={0} bg={artBaseFade} />
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
