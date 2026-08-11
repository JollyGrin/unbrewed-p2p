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
  /** body copy on the backdrop */
  ink: string;
  /** dimmer body copy */
  inkDim: string;
  /** readable text ON an accent-filled block */
  onAccent: string;
};

export const paletteFor = (deck: DeckPromo): Palette => {
  const base = deck.borderColour;
  const accent = deck.highlightColour;
  const dark = luminance(base) < 0.62;
  const ink = dark ? brand.parchment : brand.surfaceDim;
  return {
    base,
    accent,
    deep: mix(base, "#000000", dark ? 0.55 : 0.2),
    panel: mix(base, dark ? "#000000" : "#ffffff", 0.32),
    ink,
    inkDim: mix(ink, base, 0.35),
    onAccent: luminance(accent) < 0.62 ? brand.parchment : brand.surfaceDim,
  };
};
