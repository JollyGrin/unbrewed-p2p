/**
 * Old clients (#1003): a blob carrying the new display fields must still
 * draw on the renderer the bundle BEFORE this change runs. That renderer is
 * frozen in __fixtures__/pre1003 (useCanvas.tsx at de9934c) and driven here
 * exactly as the board mounts it, next to the current one.
 */
import { renderHook } from "@testing-library/react";
import { OwnedToken, migrateBlob } from "../Positions/position.type";
import { useCanvas as useCanvasPre1003 } from "./__fixtures__/pre1003/useCanvas";
import { useCanvas } from "./useCanvas";

// d3 ships ESM-only through its package exports; its UMD build is the same
// library in a shape jest can load (mock by relative path — no @/ mapper).
jest.mock("d3", () => jest.requireActual("../../node_modules/d3/dist/d3.js"));

/** A blob as a new client sends it: round, labelled, two-faced, flipped. */
const WIRE = JSON.stringify({
  color: "#48284F",
  tokens: [
    {
      id: "newbie#1",
      x: 300,
      y: 200,
      size: 80,
      h: 80,
      imageUrl: "https://example.test/frisbee.png",
      sheet: { cols: 2, rows: 1, index: 0 },
      clip: "circle",
      label: "Frisbee",
      altIndex: 1,
      flipped: true,
    },
    // only-new-fields token: must still be visible (a plain disc)
    { id: "newbie#2", x: 50, y: 50, clip: "circle", label: "Marker" },
    // fighter medallions a fresh table spawns: one with art, one without
    {
      id: "newbie#3",
      x: 150,
      y: 100,
      size: 88,
      h: 88,
      imageUrl: "https://example.test/hero.webp",
      clip: "circle",
      label: "Appa",
      rim: "#5fb94e",
      initials: "A",
      counter: { link: "hero" },
    },
    {
      id: "newbie#4",
      x: 270,
      y: 124,
      size: 64,
      h: 64,
      rim: "#5fb94e",
      initials: "S",
      counter: { value: 3, min: 0 },
    },
  ],
});

const mount = (hook: typeof useCanvas, self: string) => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  document.body.appendChild(svg);
  const blob = migrateBlob(JSON.parse(WIRE));
  const tokens: OwnedToken[] = blob.tokens.map((t) => ({
    ...t,
    owner: "newbie",
    color: blob.color,
  }));
  renderHook(() =>
    hook({
      canvasRef: { current: svg },
      gRef: { current: null },
      parentRef: { current: document.body },
      tokens,
      self,
      size: { width: 1200, height: 1000 },
      iconSvg: () => null,
    }),
  );
  const toks = svg.querySelectorAll("g.tok");
  return { svg, toks };
};

describe("new-field tokens on the pre-#1003 renderer (old bundle)", () => {
  it("draws the image as before: square, no label, first face", () => {
    const { toks } = mount(useCanvasPre1003, "oldie");
    expect(toks).toHaveLength(4);
    const piece = toks[0] as SVGGElement;
    expect(piece.getAttribute("transform")).toBe("translate(300, 200)");
    const html = piece.innerHTML;
    // the image is there, cropped to the FIRST cell of the sheet
    expect(html).toContain('href="https://example.test/frisbee.png"');
    expect(html).toMatch(/<image[^>]*x="0"[^>]*y="0"/);
    expect(html).not.toContain("tokclip");
    expect(html).not.toContain("Frisbee");
  });

  it("draws a token whose only visuals are new fields as a plain disc", () => {
    const { toks } = mount(useCanvasPre1003, "oldie");
    const html = (toks[1] as SVGGElement).innerHTML;
    expect(html).toContain('<circle cx="50" cy="50" r="48"');
  });

  it("the current renderer draws the same blob round, labelled and flipped", () => {
    const { toks } = mount(useCanvas, "oldie");
    const html = (toks[0] as SVGGElement).innerHTML;
    expect(html).toContain("tokclip-newbie1");
    expect(html).toContain("Frisbee");
    expect(html).toMatch(/<image[^>]*x="-80"/);
    expect((toks[1] as SVGGElement).innerHTML).toContain("Marker");
  });

  it("draws a fighter medallion as the image it always could, badge and all", () => {
    const { toks } = mount(useCanvasPre1003, "oldie");
    const hero = (toks[2] as SVGGElement).innerHTML;
    expect(hero).toContain('href="https://example.test/hero.webp"');
    expect(hero).toContain('width="88" height="88"');
    // the old corner badge; "–" because this mount has no pool to read
    expect(hero).toContain('class="counter"');
    expect(hero).not.toContain("heart");
    expect(hero).not.toContain('class="rim"');
  });

  it("draws an art-less fighter as the player's disc at its size, with its counter", () => {
    const { toks } = mount(useCanvasPre1003, "oldie");
    const piece = toks[3] as SVGGElement;
    expect(piece.getAttribute("transform")).toBe("translate(270, 124)");
    const html = piece.innerHTML;
    expect(html).toContain('fill="#48284F"');
    expect(html).toContain('width="64" height="64"');
    expect(html).toContain('<circle cx="50" cy="50" r="48"');
    expect(html).toContain('class="counter"');
    expect(html).not.toContain("monogram");
  });

  it("the current renderer draws those as medallions", () => {
    const { toks } = mount(useCanvas, "oldie");
    const hero = (toks[2] as SVGGElement).innerHTML;
    expect(hero).toContain('class="rim"');
    expect(hero).toContain('class="counter heart"');
    const piece = (toks[3] as SVGGElement).innerHTML;
    expect(piece).toContain('class="monogram"');
    expect(piece).toContain(">S</text>");
  });
});
