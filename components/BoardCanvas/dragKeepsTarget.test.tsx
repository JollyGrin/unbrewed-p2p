/**
 * #1629: a drag's moves re-render the board. The token being dragged must
 * keep its DOM (a touch keeps talking to the element it started on) and its
 * drag listeners (d3-drag keeps the gesture in the behaviour that started it)
 * until it is put down; before, both were replaced on the first move, which
 * cut a touch drag off and left the token lifted.
 */
import { act, renderHook } from "@testing-library/react";
import * as d3 from "d3";
import { OwnedToken } from "../Positions/position.type";
import { useCanvas } from "./useCanvas";

jest.mock("d3", () => jest.requireActual("../../node_modules/d3/dist/d3.js"));

const token = (id: string, x: number): OwnedToken =>
  ({ id, x, y: 100, size: 60, owner: "me" }) as OwnedToken;

type Props = { tokens: OwnedToken[] };

const mount = () => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  document.body.appendChild(svg);
  // jsdom has no svg geometry: make d3.pointer take its client-rect branch
  (svg as unknown as { createSVGPoint: unknown }).createSVGPoint = undefined;
  const moves: OwnedToken[] = [];
  const move = Object.assign((t: OwnedToken) => moves.push(t), {
    flush: jest.fn(),
  });
  const canvasRef = { current: svg };
  const gRef = { current: null };
  const parentRef = { current: document.body };
  const hook = renderHook(
    ({ tokens }: Props) =>
      useCanvas({
        canvasRef,
        gRef,
        parentRef,
        tokens,
        self: "me",
        size: { width: 1200, height: 1000 },
        move,
        iconSvg: () => null,
      }),
    { initialProps: { tokens: [token("me#1", 100), token("me#2", 300)] } },
  );
  const tok = (id: string) =>
    d3
      .select(svg)
      .selectAll<SVGGElement, OwnedToken>("g.tok")
      .filter((d) => d.id === id)
      .node() as SVGGElement;
  return { hook, svg, tok, move, moves };
};

const mouse = (target: EventTarget, type: string, x = 0, y = 0) =>
  target.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
      button: 0,
    }),
  );

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useCanvas — the dragged token survives the renders its drag causes", () => {
  it("keeps its markup and drag listeners mid-drag, and takes new ones after", () => {
    const { hook, tok, move } = mount();
    const dragged = tok("me#1");
    const face = dragged.firstElementChild;
    const other = tok("me#2").firstElementChild;
    const listener = d3.select(dragged).on("mousedown.drag");
    expect(face).toBeTruthy();
    expect(listener).toBeTruthy();

    act(() => {
      mouse(dragged, "mousedown", 110, 110);
      mouse(window, "mousemove", 150, 130);
    });
    // the move was sent; its echo re-renders the board mid-drag
    hook.rerender({ tokens: [token("me#1", 140), token("me#2", 320)] });
    expect(tok("me#1")).toBe(dragged);
    expect(dragged.firstElementChild).toBe(face);
    expect(d3.select(dragged).on("mousedown.drag")).toBe(listener);
    // every other token is redrawn as usual
    expect(tok("me#2").firstElementChild).not.toBe(other);
    // and the dragged one is still painted on top
    expect(dragged.parentNode!.lastElementChild).toBe(dragged);

    act(() => {
      mouse(window, "mouseup", 150, 130);
    });
    expect(move.flush).toHaveBeenCalled();
    hook.rerender({ tokens: [token("me#1", 140), token("me#2", 320)] });
    expect(tok("me#1")).toBe(dragged);
    expect(dragged.firstElementChild).not.toBe(face);
    expect(dragged.getAttribute("transform")).toBe("translate(140, 100)");
  });

  it("puts the token down on a window-level release when the drag's end is lost", () => {
    jest.useFakeTimers();
    try {
      const { hook, tok, move } = mount();
      const dragged = tok("me#1");
      const face = dragged.firstElementChild;
      act(() => {
        mouse(dragged, "mousedown", 110, 110);
      });
      // lose the drag's own end, as a replaced touch target did
      d3.select(window).on(".drag", null);
      hook.rerender({ tokens: [token("me#1", 100), token("me#2", 300)] });
      expect(dragged.firstElementChild).toBe(face); // still held

      act(() => {
        window.dispatchEvent(new Event("blur"));
        jest.runOnlyPendingTimers();
      });
      expect(move.flush).toHaveBeenCalledTimes(1);
      hook.rerender({ tokens: [token("me#1", 100), token("me#2", 300)] });
      expect(dragged.firstElementChild).not.toBe(face); // released: redrawn

      // nothing held any more: a second release does nothing
      act(() => {
        window.dispatchEvent(new Event("blur"));
        jest.runOnlyPendingTimers();
      });
      expect(move.flush).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
