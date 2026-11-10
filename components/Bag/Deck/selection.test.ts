import { selectionSx } from "./selection";

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("deck-detail text selection", () => {
  const rule = selectionSx["&::selection, & *::selection"];

  it("is solid ink on solid parchment, well over 4.5:1", () => {
    expect(rule.background).toMatch(/^#[0-9a-f]{6}$/i);
    expect(contrast(rule.background, rule.color)).toBeGreaterThan(4.5);
  });

  it("still clears 4.5:1 once dimmed to the lowest opacity copy uses (0.55) over the darkest surface", () => {
    const mix = (hex: string, over: number[], o: number) =>
      "#" +
      [1, 3, 5]
        .map((i, k) =>
          Math.round(o * parseInt(hex.slice(i, i + 2), 16) + (1 - o) * over[k])
            .toString(16)
            .padStart(2, "0"),
        )
        .join("");
    const surface = [20, 8, 24]; // the inspector overlay
    expect(
      contrast(mix(rule.background, surface, 0.55), mix(rule.color, surface, 0.55)),
    ).toBeGreaterThan(4.5);
  });

  it("sets the text fill too, so a fill-painted muted colour cannot override it", () => {
    expect(rule.WebkitTextFillColor).toBe(rule.color);
  });
});
