/**
 * FighterTokenRim — the cosmetic metal rim on a hero's fighter token (#613,
 * design doc §10). Purely decorative chrome: a masked multi-stop metallic band
 * painted INSIDE the token's existing white border.
 *
 * ⛔ It changes nothing but pixels. It carries no state, no handlers, and
 * `pointerEvents: none`, so it can never swallow the click that selects or
 * attacks the fighter it decorates.
 *
 * Why this exact geometry (§10a — the board is a stricter room than the hand):
 *
 *   • **Inside the border, always.** The element is absolutely positioned at
 *     `inset: 0`, which is the token's PADDING box — i.e. strictly inside the
 *     2px border. The zone OUTSIDE that border is spoken for by game state
 *     (white selection ring, teal ally halo, pulsing gold target, attack
 *     arrows), and a cosmetic may never render there.
 *   • **Never the disc or the border.** The mask keeps the centre fully
 *     transparent, so the seat-colour body — which IS the owner's identity —
 *     and any portrait art below show through untouched.
 *   • **Never a badge.** The band hugs the edge; the HP badge, hero-state
 *     badge, status badges, squad number and reach pill all hang at NEGATIVE
 *     offsets outside the circle, so the rim cannot reach them. The centred
 *     initials sit far inside its inner edge.
 *   • **No motion.** A static paint. Idle motion on the board means "alive"
 *     (tokenLife breathing) and stays the only rest-state animation.
 *
 * Auto-retire (§10b): below `COSMETIC_RIM_MIN_PX` rendered diameter the caller
 * simply doesn't render this at all — badges need every pixel at that size, and
 * an absolutely-positioned overlay costs no layout, so its absence shifts
 * nothing.
 */
import { Box } from "@chakra-ui/react";
import { COSMETIC_RIM_PAINTS, CosmeticRimTier } from "@/lib/pro/cosmetics";

/**
 * Rendered token diameter (px, after the board's zoom transform) below which
 * the rim retires. ~24px is where the HP pill and the initials start fighting
 * for the same pixels — a SMALL fighter at minimum zoom — and semantics-first
 * means the cosmetic is the one that yields.
 */
export const COSMETIC_RIM_MIN_PX = 24;

/**
 * Radial mask turning the painted disc into a band at the rim. Percentages are
 * of the ending shape's radius (`closest-side` on a square box = half its
 * width), so the band is always ~11% of the token's diameter however large the
 * token is drawn, and the soft inner stop keeps its edge from reading as a
 * second hard ring against portrait art.
 */
const RIM_MASK =
  "radial-gradient(circle closest-side, transparent 0 78%, rgba(0,0,0,0.6) 83%, #000 88%, #000 100%)";

export interface FighterTokenRimProps {
  tier: CosmeticRimTier;
}

export const FighterTokenRim = ({ tier }: FighterTokenRimProps) => (
  <Box
    position="absolute"
    inset={0}
    borderRadius="50%"
    // Decorative chrome, never a click target (#613) and never announced: the
    // token's own title already carries everything a player needs to read.
    pointerEvents="none"
    aria-hidden
    // Above the portrait art layer (zIndex 0) so the rim seats on the edge of
    // the picture, at the same level as the initials it never overlaps, and
    // BELOW every badge — which are later siblings and overhang the circle.
    zIndex={1}
    // Lets a test (and a human with devtools) see which tier is equipped
    // without reverse-engineering a gradient string.
    data-cosmetic-rim={tier}
    sx={{
      background: COSMETIC_RIM_PAINTS[tier].ring,
      maskImage: RIM_MASK,
      WebkitMaskImage: RIM_MASK,
    }}
  />
);
