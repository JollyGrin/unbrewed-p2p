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
  ({ id, x, y: 100, size: 60, owner: id.split("#")[0] }) as OwnedToken;

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

  // #1630: raising the pressed token on pointer-down moved its node between
  // mousedown and mouseup, and the browser then dropped the click. The first
  // press on the counter badge of any token but the top one did nothing.
  it("does not move a pressed token in the DOM until it is actually dragged", () => {
    const { tok, hook } = mount();
    const pressed = tok("me#1");
    const parent = pressed.parentNode as SVGGElement;
    expect(parent.lastElementChild).not.toBe(pressed); // not the top one
    const moved: Node[] = [];
    const insertBefore = parent.insertBefore.bind(parent);
    const appendChild = parent.appendChild.bind(parent);
    parent.insertBefore = ((n: Node, ref: Node | null) => {
      moved.push(n);
      return insertBefore(n, ref);
    }) as typeof parent.insertBefore;
    parent.appendChild = ((n: Node) => {
      moved.push(n);
      return appendChild(n);
    }) as typeof parent.appendChild;

    act(() => {
      mouse(pressed, "mousedown", 110, 110);
      mouse(window, "mouseup", 110, 110);
    });
    expect(moved).toEqual([]);
    expect(parent.lastElementChild).not.toBe(pressed);

    // a real drag brings it to the top by moving its neighbours under it
    act(() => {
      mouse(pressed, "mousedown", 110, 110);
      mouse(window, "mousemove", 150, 130);
    });
    hook.rerender({ tokens: [token("me#1", 140), token("me#2", 300)] });
    expect(parent.lastElementChild).toBe(pressed);
    // the first move itself only moved the neighbour
    expect(moved[0]).toBe(tok("me#2"));
    act(() => {
      mouse(window, "mouseup", 150, 130);
    });
  });
  // #1640: with another player's tokens later in the data, every render put
  // the pressed token back in data order (d3's join orders the nodes), which
  // moved it between pointer-down and pointer-up and lost the click.
  it("a render that lands mid-press does not move the pressed token", () => {
    const { tok, hook } = mount();
    const table = (annX: number) => [
      token("me#1", 100),
      token("me#2", 300),
      token("ann#1", annX),
    ];
    hook.rerender({ tokens: table(500) });
    const pressed = tok("me#1");
    const parent = pressed.parentNode as SVGGElement;
    const moved: Node[] = [];
    const insertBefore = parent.insertBefore.bind(parent);
    const appendChild = parent.appendChild.bind(parent);
    parent.insertBefore = ((n: Node, ref: Node | null) => {
      moved.push(n);
      return insertBefore(n, ref);
    }) as typeof parent.insertBefore;
    parent.appendChild = ((n: Node) => {
      moved.push(n);
      return appendChild(n);
    }) as typeof parent.appendChild;

    act(() => {
      mouse(pressed, "mousedown", 110, 110);
    });
    // two renders land while the button is down (ann drags her token)
    hook.rerender({ tokens: table(520) });
    hook.rerender({ tokens: table(540) });
    expect(moved).not.toContain(pressed);
    expect(tok("me#1")).toBe(pressed);
    act(() => {
      mouse(window, "mouseup", 110, 110);
    });
    // released: the next render is free to put it wherever it belongs
    hook.rerender({ tokens: table(560) });
    expect(Array.from(parent.children).map((n) => d3.select<Element, OwnedToken>(n).datum().id)).toEqual([
      "ann#1",
      "me#1",
      "me#2",
    ]);
  });

  it("a dragged token stays on top of a token another player adds mid-drag", () => {
    const { tok, hook } = mount();
    hook.rerender({
      tokens: [token("me#1", 100), token("me#2", 300), token("ann#1", 500)],
    });
    const dragged = tok("me#1");
    const parent = dragged.parentNode as SVGGElement;
    act(() => {
      mouse(dragged, "mousedown", 110, 110);
      mouse(window, "mousemove", 150, 130);
    });
    expect(parent.lastElementChild).toBe(dragged);
    hook.rerender({
      tokens: [
        token("me#1", 140),
        token("me#2", 300),
        token("ann#1", 500),
        token("ann#2", 600),
      ],
    });
    expect(tok("ann#2")).toBeTruthy();
    expect(parent.lastElementChild).toBe(dragged);
    act(() => {
      mouse(window, "mouseup", 150, 130);
    });
  });
});
