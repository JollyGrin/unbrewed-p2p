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
  ])("cover box === the top-panel window exactly — %s", (_label, card) => {
    const { container } = render(<CardFactory card={card} />);
    const art = artLayer(container);
    const props = calculateProps(card, getMeasureCanvas()!);

    // Art box in card-space units, from its inline top/left/width/height.
    const artLeft = pctToUnits(art.style.left, conprops.width);
    const artTop = pctToUnits(art.style.top, conprops.height);
    const artWidth = pctToUnits(art.style.width, conprops.width);
    const artHeight = pctToUnits(art.style.height, conprops.height);

    // The top-panel window: offset by the cream border, sized to the top panel.
    // Matching this box makes `cover` frame the art identically to the old
    // in-SVG `<image slice>` (same box → same crop), no over-zoom.
    expect(artLeft).toBeCloseTo(conprops.outerBorderWidth, 5);
    expect(artTop).toBeCloseTo(conprops.outerBorderWidth, 5);
    expect(artWidth).toBeCloseTo(props.topPanelWidth, 5);
    expect(artHeight).toBeCloseTo(props.topPanelHeight, 1);
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

/**
 * Issue #495: a card whose immediateText/duringText/afterText is whitespace-only
 * (" ", "\n", an &nbsp; from a deck-builder textarea) drew that section's
 * heading — the render gated on raw truthiness — while the layout accumulator
 * counted TRIMMED lines, so the heading occupied zero lines and the next
 * section was placed on the identical baseline. Two bold headings overlapped
 * into an unreadable garble (reported on an AQUA JET card).
 */

/** The section blocks (IMMEDIATELY / DURING COMBAT / AFTER COMBAT): each is a
 *  <text> whose first <tspan> carries the 4px heading style. */
const sectionTexts = (container: HTMLElement): SVGTextElement[] =>
  Array.from(container.querySelectorAll<SVGTextElement>("text")).filter(
    (t) => t.querySelector("tspan")?.style.fontSize === "4px",
  );

const headingOf = (t: SVGTextElement) =>
  (t.querySelector("tspan")?.textContent ?? "").trim();

describe("CardFactory sections: whitespace-only text (issue #495)", () => {
  const blankImmediate: DeckImportCardType = {
    ...base,
    title: "Aqua Jet",
    immediateText: " ",
    afterText: "Deal 1 damage to the opponent",
  };

  it("renders no heading for a whitespace-only section", () => {
    const { container } = render(<CardFactory card={blankImmediate} />);
    const sections = sectionTexts(container);
    expect(sections).toHaveLength(1);
    expect(headingOf(sections[0])).toBe("AFTER COMBAT:");
  });

  it.each([
    ["a plain space", " "],
    ["a newline", "\n"],
    ["an nbsp", " "],
  ])("treats %s as an absent section", (_label, blank) => {
    const { container } = render(
      <CardFactory
        card={{ ...base, title: "Aqua Jet", duringText: blank, afterText: "Deal 1 damage" }}
      />,
    );
    expect(sectionTexts(container).map(headingOf)).toEqual(["AFTER COMBAT:"]);
  });

  it("lays out the remaining sections at strictly increasing baselines", () => {
    // The blank IMMEDIATELY block must not consume a baseline: DURING and AFTER
    // then have to sit at distinct, ascending y values. On the raw-truthiness
    // guard the phantom heading left DURING at IMMEDIATELY's own y.
    const { container } = render(
      <CardFactory
        card={{
          ...base,
          title: "Aqua Jet",
          basicText: "This card's effect always goes first",
          immediateText: " ",
          duringText: "Deal 1 damage to the opponent",
          afterText: "Draw a card",
        }}
      />,
    );
    const sections = sectionTexts(container);
    expect(sections.map(headingOf)).toEqual(["DURING COMBAT:", "AFTER COMBAT:"]);
    const ys = sections.map((t) => Number(t.getAttribute("y")));
    ys.forEach((y) => expect(Number.isFinite(y)).toBe(true));
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThan(ys[i - 1]);
  });

  it("sizes the black panel without the phantom section", () => {
    const canvas = getMeasureCanvas()!;
    const withBlank = calculateProps(blankImmediate, canvas);
    const withoutField = calculateProps(
      { ...blankImmediate, immediateText: "" },
      canvas,
    );
    expect(withBlank.bottomPanelHeight).toBe(withoutField.bottomPanelHeight);
  });

  it("applies to the string-rendered board token path (CardSvg)", () => {
    const props = calculateProps(blankImmediate, getMeasureCanvas()!);
    const { container } = render(
      <CardSvg card={blankImmediate} props={props} />,
    );
    expect(sectionTexts(container).map(headingOf)).toEqual(["AFTER COMBAT:"]);
  });
});

/**
 * Art-free decks (issue #671). Boba Fett ships with NO card art — his author's
 * faces are scraped third-party images across eight hosts, none mirrorable — so
 * every card is `imageUrl: ""` and renders from the generated template until the
 * deck-art pipeline ticket lands. `imageUri`'s fallback is `??`, so an empty
 * string is NOT replaced by the picsum placeholder: the art window simply stays
 * empty and the frame, title, value and body text carry the card. These pin that
 * the empty string reaches the renderer as "no art" rather than as a broken
 * request or a stray stock photo.
 */
describe("CardFactory with no art (issue #671)", () => {
  const artless: DeckImportCardType = {
    ...base,
    characterName: "Boba Fett",
    title: "Disintegration",
    type: "attack",
    value: 4,
    boost: 4,
    quantity: 3,
    duringText:
      "Add +1 to this card's value for each bounty currently active under your opponent's hero card.",
    imageUrl: "" as DeckImportCardType["imageUrl"],
  };

  it("paints no art and never substitutes a stock placeholder", () => {
    const { container } = render(<CardFactory card={artless} />);
    const art = artLayer(container);
    expect(art.style.backgroundImage).not.toContain("picsum");
    expect(art.style.backgroundImage.replace(/url\(["']?["']?\)/, "")).toBe("");
  });

  it("still renders the card's title, value and body text", () => {
    const { container } = render(<CardFactory card={artless} />);
    const text = container.textContent ?? "";
    expect(text).toContain("Disintegration");
    expect(text).toContain("4");
    expect(text).toContain("each bounty currently active");
  });
});
