/**
 * Badge art (#577, extended by #717) — the client's half of the badge contract.
 *
 * What these pin:
 *  - every id this build claims to know draws its OWN art, at the 14px HUD chip
 *    and the 44px case tile alike (the art is a viewBox, so the two must agree);
 *  - an id it doesn't know still draws — the neutral fallback — but is not
 *    claimed by `isKnownBadge`, which is what keeps an invented id off the HUD;
 *  - the four deck-completion badges are ONE ladder in four metals: identical
 *    silhouette, only `tone` differing. That is the whole design, and it is the
 *    kind of thing a well-meaning edit quietly breaks.
 */
import "@testing-library/jest-dom";
import { render } from "@testing-library/react";

import { BADGE_ART, BadgeGlyph, badgeArtName, isKnownBadge } from "./BadgeGlyph";

const DECK_IDS = [
  "deck-bronze",
  "deck-silver",
  "deck-gold",
  "deck-iridescent",
] as const;

/** The `<svg>` a given id draws, at a given size. */
const drawn = (id: string, size = "2.75rem"): SVGSVGElement => {
  const { container } = render(<BadgeGlyph id={id} size={size} />);
  const svg = container.querySelector("svg");
  if (!svg) throw new Error(`no svg for ${id}`);
  return svg as SVGSVGElement;
};

/** The medallion fill — `tone`, as it actually reached the DOM. */
const toneOf = (svg: SVGSVGElement): string =>
  svg.querySelector("circle")?.getAttribute("fill") ?? "";

/** Everything inside the medallion, i.e. the glyph plus the shared disc/rim. */
const artOf = (svg: SVGSVGElement): string => svg.innerHTML;

/** Relative luminance, for "darker than" claims about a hex colour. */
const luminance = (hex: string): number => {
  const channel = (from: number) => {
    const c = parseInt(hex.slice(from, from + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
};

describe("badge art — the set", () => {
  it("draws its own art for every id it knows, at chip size and tile size", () => {
    const ids = Object.keys(BADGE_ART);
    const unknown = artOf(drawn("no-such-badge"));

    const seen = new Map<string, string>();
    for (const id of ids) {
      const art = artOf(drawn(id, "0.875rem"));
      expect(art).not.toEqual(unknown);
      // The art is a viewBox: 14px and 44px must be the same drawing.
      expect(artOf(drawn(id, "2.75rem"))).toEqual(art);
      const clash = [...seen.entries()].find(([, other]) => other === art);
      expect(clash?.[0] ?? null).toBeNull();
      seen.set(id, art);
    }
    expect(seen.size).toBe(ids.length);
  });

  it("draws, but does not claim, an id this build has never heard of", () => {
    expect(isKnownBadge("moon-walker")).toBe(false);
    expect(drawn("moon-walker").querySelector("circle")).toBeInTheDocument();
    expect(badgeArtName("moon-walker")).toBe("Badge");
  });
});

describe("badge art — the deck-completion ladder", () => {
  it("knows all four ids and names each one", () => {
    for (const id of DECK_IDS) {
      expect(isKnownBadge(id)).toBe(true);
      // Only the HUD chip needs this — /account shows the API's own name.
      expect(badgeArtName(id)).not.toBe("Badge");
    }
  });

  it("is one silhouette in four metals — only the tone differs", () => {
    const tones = DECK_IDS.map((id) => toneOf(drawn(id)));
    expect(new Set(tones).size).toBe(4);

    // Same drawing once each badge's own tone is factored out. The stroke that
    // separates the fanned cards is the tone too, hence the global replace.
    const silhouettes = DECK_IDS.map((id, i) =>
      artOf(drawn(id)).split(tones[i]).join("<tone>"),
    );
    expect(new Set(silhouettes).size).toBe(1);
  });

  it("keeps antiqued gold darker than seat gold, as the rim does", () => {
    expect(luminance(toneOf(drawn("deck-gold")))).toBeLessThan(
      luminance("#E0A82E"),
    );
  });

  it("holds still — no animation, no hue cycling", () => {
    for (const id of DECK_IDS) {
      const svg = drawn(id);
      expect(svg.querySelector("animate, animateTransform, set")).toBeNull();
      expect(svg.outerHTML).not.toMatch(/@keyframes|animation|hue-rotate/i);
    }
  });
});
