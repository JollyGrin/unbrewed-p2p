/**
 * The tier ladder, taken from the SHIPPED source of truth.
 *
 * The whole point of this ad is that what a viewer sees is what they will earn,
 * so every rim in it is painted with `lib/pro/cosmetics`' own gradients — the
 * exact strings `CardRim` (#612) and `FighterTokenRim` (#613) render at the
 * table. Nothing here re-invents a gradient, a tier name or an order; re-tune
 * the ladder in the app and this video follows it.
 */
import {
  COSMETIC_RIM_PAINTS,
  COSMETIC_RIM_STOPS,
  COSMETIC_RIM_TIERS,
  type CosmeticRimTier,
} from "../../../lib/pro/cosmetics";
import { FALLBACK_CONSTANTS } from "../../../lib/account/cosmetics";

export {
  COSMETIC_RIM_PAINTS,
  COSMETIC_RIM_STOPS,
  COSMETIC_RIM_TIERS,
  type CosmeticRimTier,
};

/** The four rungs, ascending — the array IS the ordering (cosmetics.ts). */
export const RUNGS: readonly CosmeticRimTier[] = COSMETIC_RIM_TIERS;

/** "Bronze" / "Silver" / "Antiqued gold" / "Iridescent". */
export const labelOf = (tier: CosmeticRimTier) =>
  COSMETIC_RIM_PAINTS[tier].label;

/**
 * The economy the /collection page prices upgrades with. It is the API's
 * ladder, mirrored on the client as a render hint — the same numbers a player
 * reads on the page, so the ad quotes prices rather than inventing them.
 */
export const { cardTierCosts, tokenRimThresholds } = FALLBACK_CONSTANTS;

const luminance = (hex: string) =>
  0.2126 * parseInt(hex.slice(1, 3), 16) +
  0.7152 * parseInt(hex.slice(3, 5), 16) +
  0.0722 * parseInt(hex.slice(5, 7), 16);

/**
 * A tier's own brightest stop — what `CardRim` uses for its specular hairline.
 * The ignition sweep and the glow behind a card are drawn in it for the same
 * reason: a second hand-picked highlight colour would drift from the ladder.
 */
export const sheenOf = (tier: CosmeticRimTier): string =>
  COSMETIC_RIM_STOPS[tier].reduce(
    (brightest, stop) =>
      luminance(stop.color) > luminance(brightest) ? stop.color : brightest,
    COSMETIC_RIM_STOPS[tier][0]?.color ?? "#ffffff",
  );
