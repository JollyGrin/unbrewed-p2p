import "@testing-library/jest-dom";
import { render } from "@testing-library/react";
import { CardFactory, CardSvg } from "./card.factory";
import {
  calculateProps,
  cardConstants as conprops,
  getMeasureCanvas,
} from "./card.helpers";
import { DeckImportCardType } from "../DeckPool/deck-import.type";

/**
 * Issue #373: the deck-info grid showed a white band between the art and the
 * black title panel at rest. The art was an in-SVG `<image preserveAspectRatio="
 * … slice">`; inside the clipPath group the correctly-scaled raster was
 * truncated at the bottom and only a re-composite (hover/scroll) painted the
 * missing strip.
 *
 * Fix (option 2, HTML variant): DOM-rendered cards paint the art as an HTML
 * `background-size: cover` layer BEHIND a frame-only SVG, so filling never
 * depends on the compositor honoring `slice`. The frame SVG (htmlArt) drops the
 * white top-panel rect + `<image>` and draws the cream border as an even-odd
 * ring, leaving the top-panel window transparent. String-rendered board tokens
 * (CardSvg used directly, htmlArt off) keep the self-contained all-SVG path.
 */

const base: DeckImportCardType = {
  afterText: "",
  basicText: "",
  boost: 0,
  characterName: "Thrall",
  duringText: "",
  imageUrl: "https://example.com/art.png" as DeckImportCardType["imageUrl"],
  immediateText: "",
  quantity: 1,
  title: "Earth Shock",
  type: "attack",
  value: 3,
};

// Low body text → the *tallest* top panel (worst case for the gap).
const lowTextCard: DeckImportCardType = { ...base, title: "Grounding Totem" };
// Heavy body text → a short top panel, to prove coverage holds either way.
const highTextCard: DeckImportCardType = {
  ...base,
  title: "Chain Lightning",
  duringText:
    "Deal 1 damage to an enemy fighter adjacent to the opposing fighter and 1 damage to an enemy fighter adjacent to that adjacent fighter, and again, and again.",
};

/** The HTML cover-art layer the DOM renderer paints behind the frame SVG. */
const artLayer = (container: HTMLElement): HTMLElement => {
  const el = Array.from(container.querySelectorAll<HTMLElement>("div")).find(
    (d) => d.style.backgroundSize === "cover",
  );
  if (!el) throw new Error("no cover-art layer found");
  return el;
};

/** Inset percentage (e.g. "3.41%") → card-space units against `dim`. */
const pctToUnits = (pct: string, dim: number) =>
  (parseFloat(pct) / 100) * dim;

describe("CardFactory art: HTML cover layer (issue #373)", () => {
  it("paints the art as a background-size:cover HTML layer with the card image", () => {
    const { container } = render(<CardFactory card={lowTextCard} />);
    const art = artLayer(container);
    expect(art.style.backgroundSize).toBe("cover");
    expect(art.style.backgroundImage).toContain("https://example.com/art.png");
  });

  it("stacks the frame SVG above the art layer (frame must win)", () => {
    // Regression guard: CSS paints positioned elements after in-flow siblings,
    // so the positioned art div would cover the frame unless the SVG is lifted
    // above it. The art layer sits at z-index 0; the SVG's wrapper above it.
    const { container } = render(<CardFactory card={lowTextCard} />);
    const art = artLayer(container);
    expect(Number(art.style.zIndex)).toBe(0);
    const svgWrapper = container.querySelector("svg")!.parentElement!;
    expect(Number(svgWrapper.style.zIndex)).toBeGreaterThan(
      Number(art.style.zIndex),
    );
  });

  it.each([
    ["low-text (tall top panel)", lowTextCard],
    ["high-text (short top panel)", highTextCard],
  ])("cover box fully covers the top panel — %s", (_label, card) => {
    const { container } = render(<CardFactory card={card} />);
    const art = artLayer(container);
    const props = calculateProps(card, getMeasureCanvas()!);

    // Art box in card-space units (inset by the cream border on every side).
    const artTop = pctToUnits(art.style.top, conprops.height);
    const artBottom =
      conprops.height - pctToUnits(art.style.bottom, conprops.height);

    // The top panel occupies card-y [outerBorderWidth, outerBorderWidth+topPanelHeight];
    // the black bottom panel starts at outerBorderWidth+bottomPanelY.
    const topPanelTop = conprops.outerBorderWidth;
    const topPanelBottom = conprops.outerBorderWidth + props.topPanelHeight;
    const blackPanelTop = conprops.outerBorderWidth + props.bottomPanelY;

    // Covers the whole top panel...
    expect(artTop).toBeLessThanOrEqual(topPanelTop + 1e-6);
    expect(artBottom).toBeGreaterThanOrEqual(topPanelBottom - 1e-6);
    // ...and extends under the black panel, so there can be no seam/white band.
    expect(artBottom).toBeGreaterThan(blackPanelTop);
  });

  it("frame SVG (htmlArt) has no white top-panel rect and no in-SVG art image", () => {
    const { container } = render(<CardFactory card={lowTextCard} />);
    const svg = container.querySelector("svg")!;
    expect(svg.querySelector("image")).toBeNull();
    expect(svg.querySelector(".top-panel")).toBeNull();
    // Cream base is an even-odd ring, so the top-panel window is transparent.
    const ring = svg.querySelector("path[fill-rule='evenodd']");
    expect(ring).not.toBeNull();
  });

  it("board tokens (CardSvg default) keep the self-contained slice art path", () => {
    const props = calculateProps(lowTextCard, getMeasureCanvas()!);
    const { container } = render(<CardSvg card={lowTextCard} props={props} />);
    const svg = container.querySelector("svg")!;
    const image = svg.querySelector("image");
    expect(image).not.toBeNull();
    expect(image!.getAttribute("preserveAspectRatio")).toBe("xMidYMid slice");
    expect(svg.querySelector(".top-panel")).not.toBeNull();
    // Solid rounded-rect base (no even-odd ring, no transparent window).
    expect(svg.querySelector("path[fill-rule='evenodd']")).toBeNull();
    expect(svg.querySelector("rect[rx]")).not.toBeNull();
  });
});
