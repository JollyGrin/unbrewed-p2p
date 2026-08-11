import { brand } from "../theme";
import type { DeckPromo } from "./deck";

/** Deck palettes are arbitrary hex, so the template derives every shade it
 * needs from them instead of hard-coding a second set of brand colors. */

const parseHex = (hex: string): [number, number, number] => {
  const clean = hex.replace("#", "").trim();
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean.padEnd(6, "0").slice(0, 6);
  return [
    parseInt(full.slice(0, 2), 16) || 0,
    parseInt(full.slice(2, 4), 16) || 0,
    parseInt(full.slice(4, 6), 16) || 0,
  ];
};

const toHex = (channels: [number, number, number]) =>
  `#${channels
    .map((c) =>
      Math.max(0, Math.min(255, Math.round(c)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;

/** Blend two colors; t=0 is `a`, t=1 is `b`. */
export const mix = (a: string, b: string, t: number): string => {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  return toHex([ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t]);
};

export const alpha = (hex: string, a: number): string => {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

const luminance = (hex: string): number => {
  const [r, g, b] = parseHex(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};

export type Palette = {
  /** deck borderColour — the base of the backdrop */
  base: string;
  /** deck highlightColour — accents, rules, headings */
  accent: string;
  /** darkened base, bottom of the backdrop gradient */
  deep: string;
  /** panel fill that reads as "on top of" the backdrop */
  panel: string;
  /** body copy on the backdrop (always dark, so always the parchment ink) */
  ink: string;
  /** dimmer body copy */
  inkDim: string;
  /** readable text ON an accent-filled block */
  onAccent: string;
};

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
