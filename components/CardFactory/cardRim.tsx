import { FC } from "react";
import {
  COSMETIC_RIM_PAINTS,
  COSMETIC_RIM_STOPS,
  CosmeticRimTier,
} from "@/lib/pro/cosmetics";

/**
 * The metal-rim ladder on a CARD (#612) — the card-side half of the shared
 * cosmetic ladder whose token-side half is `FighterTokenRim` (#613). Both read
 * `COSMETIC_RIM_PAINTS`, so bronze/silver/antiqued-gold/iridescent are visibly
 * the same four rewards on two surfaces.
 *
 * MECHANISM (design doc §6): a translucent metallic rim overlaid JUST INSIDE
 * the card boundary, never a frame recolor. Image decks are one flat bitmap
 * (frame, art and text baked together) while generated decks are live SVG, so
 * the only mechanism that reads identically on both is one that never needs to
 * know where the frame is. Because this is a plain SVG `<g>` in the shared
 * 63x88 card viewBox, the same element serves all four render combinations —
 * generated/image x DOM-hybrid/board-token — and it is `renderToStaticMarkup`-
 * safe for the string-rendered board tokens.
 *
 * WHY A LINEAR GRADIENT, when the token paints a conic one: SVG 1.1 has no
 * conic gradient, and the board-token face is string-rendered SVG where
 * `foreignObject` is ruled out (§6), so a CSS paint cannot reach it. The card
 * therefore paints the SAME stops, in the same order, along the card's
 * diagonal — `COSMETIC_RIM_STOPS` derives them from the shared ring paint, so
 * the two surfaces cannot drift apart on a re-tune.
 *
 * SEMANTICS FIRST (design doc §9b — hard requirements, not taste):
 *   - Game state owns FLAT, single-hue signals AT or OUTSIDE the card edge (the
 *     `#E0A82E` playable ring in ProHand, per-deck `highlightColour`). Every
 *     tier here is a MULTI-STOP gradient drawn INSIDE the edge — material, not
 *     signal. Never add a flat single-color ring.
 *   - Tier 3 is ANTIQUED gold, deliberately away from the playable ring, so a
 *     rim can never be misread as "this card is playable".
 *   - Tier 4 is a STATIC spectrum. No hue animation anywhere: a hue cycle
 *     passes through every signal color, and a rainbow rim reads as a green
 *     "selectable" ring the moment someone screenshots it.
 *   - Nothing animates at all. In hand at rest nothing moves today, and that
 *     absence is itself a signal channel worth preserving.
 *   - No `filter`/`opacity` fighting the unplayable dim: the rim lives inside
 *     the card, so ProHand's `grayscale(0.4) brightness(0.75)` dims it WITH the
 *     card, which is correct.
 *   - `pointer-events: none` and a stroke that stays strictly inside the 63x88
 *     box: no hitbox change, no viewBox change, no z-order change.
 *
 * Gradient ids are DETERMINISTIC per tier rather than per card instance. Two
 * cards of the same tier therefore emit byte-identical defs, so a duplicate id
 * in the document resolves to an identical gradient — harmless — while
 * `pro:render-fuzz` and jest snapshots stay stable, and the string-rendered
 * token path needs no unique-id plumbing.
 */

/** Card geometry (mirrors `cardConstants`, and `ImageFace`'s rx=2.5 clip). */
const CARD_W = 63;
const CARD_H = 88;
const CARD_RADIUS = 2.5;
/** Rim band, in card units. At a ~135px hand card this is ~3px — legible at
 * hand-fan size without crowding the frame's own border. */
const RIM_WIDTH = 1.4;
/** Stroke is centered on its path, so half the width sits inside the inset. */
const RIM_INSET = RIM_WIDTH / 2;
/** Specular hairline riding the rim's inner boundary — the "polished metal"
 * read that a single gradient band alone does not give. */
const HAIRLINE_WIDTH = 0.3;
const HAIRLINE_INSET = RIM_WIDTH + HAIRLINE_WIDTH / 2;
/** Translucent, per §6 — the rim is an overlay on the card, not a new frame. */
const RIM_OPACITY = 0.88;

/** Stable, tier-scoped gradient ids — see the id note in the module doc. */
export const rimBodyId = (tier: CosmeticRimTier) => `unbrewed-rim-${tier}`;
export const rimSheenId = (tier: CosmeticRimTier) =>
  `unbrewed-rim-${tier}-sheen`;

/** Perceived luminance, for picking the paint's own brightest stop as the
 * specular highlight — so the hairline is derived from the shared ladder too,
 * never a second hand-tuned palette that could drift from it. */
const luminance = (hex: string) =>
  0.2126 * parseInt(hex.slice(1, 3), 16) +
  0.7152 * parseInt(hex.slice(3, 5), 16) +
  0.0722 * parseInt(hex.slice(5, 7), 16);

const sheenColorOf = (tier: CosmeticRimTier): string =>
  COSMETIC_RIM_STOPS[tier].reduce(
    (brightest, stop) =>
      luminance(stop.color) > luminance(brightest) ? stop.color : brightest,
    COSMETIC_RIM_STOPS[tier][0]?.color ?? "#ffffff",
  );

/**
 * The rim overlay. Renders NOTHING for an un-upgraded card, so the base render
 * of every existing card is untouched and a treatment that fails to resolve
 * degrades to base art with zero gameplay consequence.
 *
 * Must be the LAST child of the card's `<svg>`: it paints over the frame (and,
 * in the DOM-hybrid path, over the HTML art layer the frame SVG already sits
 * above) without any z-index of its own.
 */
export const CardRim: FC<{ tier?: CosmeticRimTier | null }> = ({ tier }) => {
  if (!tier) return null;
  const stops = COSMETIC_RIM_STOPS[tier];
  const sheen = sheenColorOf(tier);
  const bodyId = rimBodyId(tier);
  const sheenId = rimSheenId(tier);
  return (
    <g
      aria-hidden
      pointerEvents="none"
      data-cosmetic-rim={tier}
      data-rim-label={COSMETIC_RIM_PAINTS[tier].label}
      opacity={RIM_OPACITY}
    >
      <defs>
        {/* Diagonal, so the metal catches "light" across the card's long axis.
            Stops are the shared conic paint's, in order. */}
        <linearGradient id={bodyId} x1="0" y1="0" x2="1" y2="1">
          {stops.map((stop, i) => (
            <stop key={i} offset={stop.offset} stopColor={stop.color} />
          ))}
        </linearGradient>
        {/* Counter-diagonal specular streak, transparent at both ends so the
            hairline never reads as a second closed ring. */}
        <linearGradient id={sheenId} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sheen} stopOpacity={0} />
          <stop offset="0.3" stopColor={sheen} stopOpacity={0.55} />
          <stop offset="0.55" stopColor={sheen} stopOpacity={0} />
          <stop offset="0.8" stopColor={sheen} stopOpacity={0.3} />
          <stop offset="1" stopColor={sheen} stopOpacity={0} />
        </linearGradient>
      </defs>
      <rect
        x={RIM_INSET}
        y={RIM_INSET}
        width={CARD_W - 2 * RIM_INSET}
        height={CARD_H - 2 * RIM_INSET}
        rx={CARD_RADIUS - RIM_INSET}
        fill="none"
        stroke={`url(#${bodyId})`}
        strokeWidth={RIM_WIDTH}
      />
      <rect
        x={HAIRLINE_INSET}
        y={HAIRLINE_INSET}
        width={CARD_W - 2 * HAIRLINE_INSET}
        height={CARD_H - 2 * HAIRLINE_INSET}
        rx={Math.max(CARD_RADIUS - HAIRLINE_INSET, 0)}
        fill="none"
        stroke={`url(#${sheenId})`}
        strokeWidth={HAIRLINE_WIDTH}
      />
    </g>
  );
};
