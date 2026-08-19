import { brand } from "../theme";
import { luminance, mix, type Palette } from "../shared/color";

/**
 * The ad's palette is the BRAND's, not a deck's.
 *
 * `DeckAnnouncement` derives everything from the deck it is selling, which is
 * right for a deck launch. This video sells a platform feature, and the thing
 * that has to read on every frame is METAL — four rims whose whole vocabulary
 * is warm/cool multi-stop gradient. Thrall's fluorescent green border would
 * fight bronze and antiqued gold for the same corner of the wheel, so the
 * backdrop is the brand's deep purple and the accent is its parchment gold:
 * neutral enough that the ladder is the only thing changing colour.
 */
const base = brand.surface;
const accent = brand.primary;

export const COSMETICS_PALETTE: Palette = {
  base,
  accent,
  deep: mix(base, "#000000", 0.62),
  panel: mix(base, "#000000", 0.34),
  ink: brand.parchment,
  inkDim: mix(brand.parchment, base, 0.38),
  onAccent: luminance(accent) < 0.62 ? brand.parchment : brand.surfaceDim,
};

/** The parchment sheet /collection renders its panels on. */
export const PARCHMENT = brand.parchment;
/** Ink on that sheet — the app's own body colour on parchment. */
export const PARCHMENT_INK = brand.surfaceDim;
