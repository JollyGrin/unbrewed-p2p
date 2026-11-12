/**
 * #1603: the board's d3 zoom behaviour is built once per svg. Rebuilding it on
 * every effect run (each token move or selection change) swapped the svg's
 * zoom listeners mid-gesture, and a double-tap whose second touchend landed in
 * a fresh instance read `touchfirst[0]` off undefined.
 */
import { act, renderHook } from "@testing-library/react";
import * as d3 from "d3";
import { OwnedToken } from "../Positions/position.type";
import { useCanvas } from "./useCanvas";

// See tokenCompat.test.tsx: jest loads d3's UMD build. `zoom` is wrapped so
// the test can count the behaviours useCanvas builds (a spy can't reach the
// namespace copy useCanvas imported).
jest.mock("d3", () => {
  const real = jest.requireActual("../../node_modules/d3/dist/d3.js");
  return {
    ...real,
    zoom: (...args: unknown[]) => {
      const z = real.zoom(...args);
      (globalThis as { __zooms?: unknown[] }).__zooms?.push(z);
      return z;
    },
  };
});

const token = (id: string, x: number): OwnedToken =>
  ({
    id,
    x,
    y: 100,
    size: 60,
    h: 60,
    imageUrl: "https://example.test/hero.png",
    label: "Hero",
    owner: "me",
  }) as OwnedToken;

type Props = {
  tokens: OwnedToken[];
  selectedId: string | null;
  size: { width: number; height: number };
};

const mount = () => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  document.body.appendChild(svg);
  svg.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 1200, height: 1000 }) as DOMRect;
  const canvasRef = { current: svg };
  const gRef = { current: null };
  const parentRef = { current: document.body };
  const onSelect = () => {};
  const hook = renderHook(
    ({ tokens, selectedId, size }: Props) =>
      useCanvas({
        canvasRef,
        gRef,
        parentRef,
        tokens,
        self: "me",
        size,
        selectedId,
        onSelect,
        iconSvg: () => null,
      }),
    {
      initialProps: {
        tokens: [token("me#1", 100)],
        selectedId: null,
        size: { width: 1200, height: 1000 },
      } as Props,
    },
  );
  return { hook, svg };
};

/** A one-finger touch event; jsdom has no Touch constructor worth using. */
const touch = (svg: SVGSVGElement, type: "touchstart" | "touchend") => {
  const t = { identifier: 1, clientX: 300, clientY: 300 };
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, "touches", {
    value: type === "touchend" ? [] : [t],
  });
  Object.defineProperty(ev, "changedTouches", { value: [t] });
  svg.dispatchEvent(ev);
};

// d3-zoom only binds touch listeners where touch is available.
const realMaxTouch = Object.getOwnPropertyDescriptor(
  window.navigator,
  "maxTouchPoints",
);
beforeAll(() => {
  Object.defineProperty(window.navigator, "maxTouchPoints", {
    value: 5,
    configurable: true,
  });
});
afterAll(() => {
  if (realMaxTouch)
    Object.defineProperty(window.navigator, "maxTouchPoints", realMaxTouch);
  else delete (window.navigator as { maxTouchPoints?: number }).maxTouchPoints;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useCanvas — zoom behaviour survives re-renders (#1603)", () => {
  it("keeps the same zoom listeners across new tokens and a new selection", () => {
    const { hook, svg } = mount();
    const sel = d3.select(svg);
    const before = ["touchstart", "touchend", "wheel", "mousedown"].map((t) =>
      sel.on(`${t}.zoom`),
    );
    expect(before.every(Boolean)).toBe(true);

    hook.rerender({
      tokens: [token("me#1", 250), token("me#2", 400)],
      selectedId: "me#1",
      size: { width: 1200, height: 1000 },
    });

    const after = ["touchstart", "touchend", "wheel", "mousedown"].map((t) =>
      sel.on(`${t}.zoom`),
    );
    expect(after).toEqual(before);
    after.forEach((fn, i) => expect(fn).toBe(before[i]));
  });

  it("finishes a double-tap whose second touchend lands after a re-render", () => {
    const errors: unknown[] = [];
    const onError = (e: ErrorEvent) => {
      errors.push(e.error);
      e.preventDefault();
    };
    window.addEventListener("error", onError);
    try {
      const { hook, svg } = mount();
      act(() => {
        touch(svg, "touchstart");
        touch(svg, "touchend");
        touch(svg, "touchstart");
      });
      // The tap selected a token (or another player moved one) before the
      // finger lifted.
      hook.rerender({
        tokens: [token("me#1", 100)],
        selectedId: "me#1",
        size: { width: 1200, height: 1000 },
      });
      act(() => touch(svg, "touchend"));
    } finally {
      window.removeEventListener("error", onError);
    }
    expect(errors).toEqual([]);
  });

  it("builds one zoom, keeps the view and updates its extent on a resize", () => {
    const made: d3.ZoomBehavior<SVGSVGElement, unknown>[] = [];
    (globalThis as { __zooms?: unknown[] }).__zooms = made;
    try {
      const { hook, svg } = mount();
      const t0 = d3.zoomTransform(svg).toString();
      hook.rerender({
        tokens: [token("me#1", 100)],
        selectedId: "me#1",
        size: { width: 600, height: 400 },
      });
      expect(made).toHaveLength(1);
      expect(svg.getAttribute("width")).toBe("600");
      // A resize is not a first render: the view is kept, not refitted.
      expect(d3.zoomTransform(svg).toString()).toBe(t0);
      const extent = made[0].extent() as unknown as (
        this: SVGSVGElement,
      ) => [[number, number], [number, number]];
      expect(extent.call(svg)).toEqual([
        [0, 0],
        [600, 400],
      ]);
    } finally {
      delete (globalThis as { __zooms?: unknown[] }).__zooms;
    }
  });
});
