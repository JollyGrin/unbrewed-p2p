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
    expect(toks).toHaveLength(2);
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
});
