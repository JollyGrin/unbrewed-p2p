/**
 * Colour maths shared by every composition. Deck palettes (and the cosmetics
 * ad's brand palette) are arbitrary hex, so each template derives the shades it
 * needs from them instead of hard-coding a second set of brand colours.
 */

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

/** Perceived brightness, 0..1. */
export const luminance = (hex: string): number => {
  const [r, g, b] = parseHex(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};

/** The contract every scene reads its colours through. */
export type Palette = {
  /** the base of the backdrop */
  base: string;
  /** accents, rules, headings */
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
