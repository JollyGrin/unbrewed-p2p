/**
 * Hotseat "Rotate board": the board turns 180° about the map's centre inside
 * the zoom transform, each token turns back so it reads upright, and the
 * screen → board conversions undo the turn so drops land under the pointer.
 */
import { renderHook } from "@testing-library/react";
import { MutableRefObject } from "react";
import { OwnedToken } from "../Positions/position.type";
import { useCanvas } from "./useCanvas";

// See tokenCompat.test.tsx: jest loads d3's UMD build.
jest.mock("d3", () => jest.requireActual("../../node_modules/d3/dist/d3.js"));

const TOKEN = {
  id: "me#1",
  x: 100,
  y: 200,
  size: 60,
  h: 40,
  imageUrl: "https://example.test/hero.png",
  label: "Hero",
  owner: "me",
} as OwnedToken;

const mount = () => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "image");
  bg.setAttribute("class", "background");
  svg.appendChild(bg);
  document.body.appendChild(svg);
  // A 1200×1000 viewport at the page origin: the first fit is the identity.
  svg.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 1200, height: 1000 }) as DOMRect;
  const canvasRef = { current: svg };
  const gRef = { current: null };
  const parentRef = { current: document.body };
  const centerRef = { current: () => ({ x: 0, y: 0 }) } as MutableRefObject<
    () => { x: number; y: number }
  >;
  const screenToBoardRef = {
    current: () => ({ x: 0, y: 0 }),
  } as MutableRefObject<(sx: number, sy: number) => { x: number; y: number }>;
  const hook = renderHook(
    ({ rotated }: { rotated: boolean }) =>
      useCanvas({
        canvasRef,
        gRef,
        parentRef,
        tokens: [TOKEN],
        self: "me",
        size: { width: 1200, height: 1000 },
        iconSvg: () => null,
        centerRef,
        screenToBoardRef,
        rotated,
      }),
    { initialProps: { rotated: false } },
  );
  const board = () => svg.querySelector("g")!;
  const tok = () => svg.querySelector("g.tok")!;
  return { hook, svg, bg, board, tok, centerRef, screenToBoardRef };
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useCanvas — rotated board (hotseat)", () => {
  it("draws upright and unturned by default", () => {
    const { board, bg, tok, screenToBoardRef } = mount();
    expect(board().getAttribute("transform")).not.toContain("rotate");
    expect(bg.getAttribute("transform")).not.toContain("rotate");
    expect(tok().querySelector("g.upright")).toBeNull();
    expect(screenToBoardRef.current(100, 200)).toEqual({ x: 100, y: 200 });
  });

  it("turns the map and background 180° about the centre, keeping the view", () => {
    const { hook, board, bg } = mount();
    const before = board().getAttribute("transform");
    hook.rerender({ rotated: true });
    expect(board().getAttribute("transform")).toBe(`${before} rotate(180 600 500)`);
    expect(bg.getAttribute("transform")).toBe(`${before} rotate(180 600 500)`);

    hook.rerender({ rotated: false });
    expect(board().getAttribute("transform")).toBe(before);
  });

  it("turns each token back about its own centre, label included", () => {
    const { hook, tok } = mount();
    hook.rerender({ rotated: true });
    // The token keeps its board position; only its face turns.
    expect(tok().getAttribute("transform")).toBe("translate(100, 200)");
    const upright = tok().querySelector("g.upright")!;
    expect(upright.getAttribute("transform")).toBe("rotate(180 30 20)");
    expect(upright.querySelector("image")).not.toBeNull();
    expect(upright.querySelector("g.label")).not.toBeNull();
  });

  it("maps screen points back through the turn, so drops land under the pointer", () => {
    const { hook, centerRef, screenToBoardRef } = mount();
    hook.rerender({ rotated: true });
    // The screen point (100, 200) shows the board point (1100, 800).
    expect(screenToBoardRef.current(100, 200)).toEqual({ x: 1100, y: 800 });
    // The viewport centre is the map centre either way.
    expect(centerRef.current()).toEqual({ x: 600, y: 500 });
  });
});
