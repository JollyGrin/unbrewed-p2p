import "@testing-library/jest-dom";
import { render } from "@testing-library/react";
import { CardFactory, CardSvg } from "./card.factory";
import { calculateProps, getMeasureCanvas } from "./card.helpers";
import { DeckImportCardType } from "../DeckPool/deck-import.type";

/**
 * Issue #373: the art `<image preserveAspectRatio="… slice">` was being
 * mis-rasterized as `meet` at rest inside the deck-info modal's scrolled
 * aspect-ratio tiles, leaving a white band of the #fff top panel below the art.
 * The fix promotes DOM-rendered cards onto their own GPU compositing layer via
 * `transform: translateZ(0)`, so the `slice` raster is computed once, correctly.
 * String-rendered board tokens deliberately opt OUT so d3 zoom keeps the vector
 * crisp (a promoted layer would blur when the board scales up).
 */

// Minimal low-text card (the worst case for the gap — tall top panel).
const lowTextCard: DeckImportCardType = {
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

describe("CardFactory art layer promotion (issue #373)", () => {
  it("DOM-rendered cards are promoted to their own GPU layer", () => {
    const { container } = render(<CardFactory card={lowTextCard} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    // translateZ(0) forces a stable compositing layer so `slice` rasterizes right.
    expect(svg!.style.transform).toContain("translateZ(0)");
  });

  it("board-token cards (promoteLayer off) are NOT promoted, staying vector-crisp", () => {
    const props = calculateProps(lowTextCard, getMeasureCanvas()!);
    const { container } = render(<CardSvg card={lowTextCard} props={props} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.style.transform).toBe("");
  });

  it("keeps the slice art image covering the full top panel", () => {
    // The gap can only appear if the art stops honoring `slice`; guard that the
    // art `<image>` still declares `slice` so it fills the #fff top-panel box.
    const props = calculateProps(lowTextCard, getMeasureCanvas()!);
    const { container } = render(<CardSvg card={lowTextCard} props={props} />);
    const image = container.querySelector("image");
    expect(image).not.toBeNull();
    expect(image!.getAttribute("preserveAspectRatio")).toBe("xMidYMid slice");
  });
});
