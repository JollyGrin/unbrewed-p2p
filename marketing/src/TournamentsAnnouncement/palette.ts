import { brand } from "../theme";
import { luminance, mix, type Palette } from "../shared/color";

/**
 * Brand palette, like the other platform-feature ads. The accent is the
 * tournaments pages' own gold (the crown, "I'm ready to play", the champion
 * card), so the drawn moments match the captured ones.
 */
const base = brand.surface;
const accent = brand.accent;

export const TOURNAMENTS_PALETTE: Palette = {
  base,
  accent,
  deep: mix(base, "#000000", 0.62),
  panel: mix(base, "#000000", 0.34),
  ink: brand.parchment,
  inkDim: mix(brand.parchment, base, 0.38),
  onAccent: luminance(accent) < 0.62 ? brand.parchment : brand.surfaceDim,
};

/** The pages' own paper, sampled from the capture: what a plate sits on. */
export const PAGE_PAPER = "#F1E0C1";
