/**
 * #1029: an image token whose image fails to load (an expired Labs hosted-save
 * image) draws a placeholder instead of nothing, and a new url draws again.
 */
import { act, renderHook } from "@testing-library/react";
import { OwnedToken } from "../Positions/position.type";
import { useCanvas } from "./useCanvas";

// See tokenCompat.test.tsx: jest loads d3's UMD build.
jest.mock("d3", () => jest.requireActual("../../node_modules/d3/dist/d3.js"));

const DEAD = "https://example.test/expired.png";
const token = (imageUrl: string): OwnedToken =>
  ({
    id: "me#1",
    x: 100,
    y: 100,
    size: 72,
    h: 72,
    imageUrl,
    clip: "circle",
    label: "Frisbee",
    owner: "me",
  }) as OwnedToken;

const mount = () => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  document.body.appendChild(svg);
  const hook = renderHook(
    ({ tokens }: { tokens: OwnedToken[] }) =>
      useCanvas({
        canvasRef: { current: svg },
        gRef: { current: null },
        parentRef: { current: document.body },
        tokens,
        self: "me",
        size: { width: 1200, height: 1000 },
        iconSvg: () => null,
      }),
    { initialProps: { tokens: [token(DEAD)] } },
  );
  const tok = () => svg.querySelector("g.tok")!;
  return { hook, tok };
};

describe("useCanvas — image that fails to load", () => {
  it("swaps the face for a placeholder, keeps the label, and draws a new url", () => {
    const { hook, tok } = mount();
    const image = tok().querySelector("image")!;
    expect(image.getAttribute("href")).toBe(DEAD);

    act(() => {
      image.dispatchEvent(new Event("error"));
    });
    expect(tok().querySelector("image")).toBeNull();
    expect(tok().innerHTML).toContain("Image unavailable");
    expect(tok().querySelector("g.label")).not.toBeNull();

    // a deck refresh points the token at the new render
    const FRESH = "https://example.test/fresh.png";
    hook.rerender({ tokens: [token(FRESH)] });
    expect(tok().querySelector("image")?.getAttribute("href")).toBe(FRESH);
  });
});
