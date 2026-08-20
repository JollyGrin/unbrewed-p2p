import { brand } from "../theme";
import { luminance, mix, type Palette } from "../shared/color";
import type { DeckPromo } from "../shared/deck";

export { alpha, mix, type Palette } from "../shared/color";

export const paletteFor = (deck: DeckPromo): Palette => {
  // Deck border colours are picked to frame a card, not to fill a screen:
  // taranis/doppelganger are near-black, but thrall (#86d41a) and cairne
  // (#60f10f) are fluorescent green. Pull a light deck down onto the brand's
  // dark surface — it keeps the deck's hue as a tint and every scene keeps the
  // same contrast contract. Decks that are already dark are untouched.
  const raw = deck.borderColour;
  const base = luminance(raw) < 0.62 ? raw : mix(raw, brand.surfaceDim, 0.78);

  // Same problem on the accent: thrall's highlight is a dark blue that would
  // vanish as heading text on the backdrop. Lift it until it reads.
  const rawAccent = deck.highlightColour;
  const accent =
    luminance(rawAccent) < 0.42 ? mix(rawAccent, "#ffffff", 0.5) : rawAccent;

  return {
    base,
    accent,
    deep: mix(base, "#000000", 0.55),
    panel: mix(base, "#000000", 0.32),
    ink: brand.parchment,
    inkDim: mix(brand.parchment, base, 0.35),
    onAccent: luminance(accent) < 0.62 ? brand.parchment : brand.surfaceDim,
  };
};
