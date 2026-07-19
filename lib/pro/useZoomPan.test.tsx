/**
 * Initial fit + pan clamping for the full-viewport Pro board (issue #450).
 *
 * jsdom reports every layout box as 0×0, so these tests stub the two sizes the
 * hook measures — the viewport box (clientWidth/Height on the container) and the
 * board's LAYOUT size (offsetWidth/Height on the frame) — and drive a real
 * ResizeObserver stub, since that is what triggers the fit.
 */
import { MutableRefObject, useRef } from "react";
import { act, render, screen } from "@testing-library/react";
import { ZOOM_MAX, ZOOM_MIN, ZoomPanInset, useZoomPan } from "./useZoomPan";

// jsdom has no ResizeObserver; the hook only needs "call me once on observe",
// because every later size change in these tests is explicit.
class StubResizeObserver {
  constructor(private cb: () => void) {}
  observe() {
    this.cb();
  }
  disconnect() {}
}
(global as unknown as { ResizeObserver: unknown }).ResizeObserver = StubResizeObserver;

const VIEWPORT = { w: 1600, h: 1000 };
const BOARD = { w: 1600, h: 900 }; // wider than it is tall, like a real map

const size = (el: HTMLElement, box: "client" | "offset", w: number, h: number) => {
  Object.defineProperty(el, `${box}Width`, { value: w, configurable: true });
  Object.defineProperty(el, `${box}Height`, { value: h, configurable: true });
};

/** Mirrors ProBoard's wiring: outer box = viewport, inner frame = transformed. */
const Harness = ({ inset }: { inset?: ZoomPanInset }) => {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const zoom = useZoomPan(true, frameRef, inset);
  return (
    <div
      data-testid="viewport"
      ref={(el) => {
        if (el) size(el, "client", VIEWPORT.w, VIEWPORT.h);
        (zoom.containerRef as MutableRefObject<HTMLDivElement | null>).current = el;
      }}
      {...zoom.handlers}
    >
      <div
        data-testid="frame"
        ref={(el) => {
          if (el) size(el, "offset", BOARD.w, BOARD.h);
          frameRef.current = el;
        }}
        style={{ transform: zoom.transform, transformOrigin: zoom.transformOrigin }}
      />
      {zoom.active && <button onClick={zoom.reset}>reset view</button>}
    </div>
  );
};

/** translate(Xpx, Ypx) scale(S) -> {tx, ty, scale} */
const readTransform = (): { tx: number; ty: number; scale: number } => {
  const t = screen.getByTestId("frame").style.transform;
  const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/.exec(t);
  if (!m) throw new Error(`unparsable transform: ${t}`);
  return { tx: +m[1], ty: +m[2], scale: +m[3] };
};

const drag = (from: [number, number], to: [number, number]) => {
  const vp = screen.getByTestId("viewport");
  act(() => {
    vp.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true, clientX: from[0], clientY: from[1] }) as PointerEvent
    );
    // one big move: past PAN_THRESHOLD, so the whole delta is a pan
    window.dispatchEvent(
      new MouseEvent("pointermove", { bubbles: true, clientX: to[0], clientY: to[1] }) as PointerEvent
    );
    window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }) as PointerEvent);
    // the trailing click a real mouse drag always fires: the board's capture
    // handler swallows it (that's the "no action after a pan" guarantee) and
    // clears the flag, so the NEXT click — e.g. "reset view" — lands normally.
    vp.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

describe("useZoomPan initial fit (issue #450)", () => {
  it("scales the board down to fit and centers it in the whole viewport", () => {
    render(<Harness />);
    const { tx, ty, scale } = readTransform();
    // width is the binding constraint (1600/1600 = 1 vs 1000/900 = 1.11)
    expect(scale).toBeCloseTo(1, 3);
    expect(tx).toBeCloseTo(0, 1); // fills the width exactly
    expect(ty).toBeCloseTo((VIEWPORT.h - BOARD.h) / 2, 1); // centered vertically
  });

  it("centers in the region left over by the overlays, not the raw viewport", () => {
    render(<Harness inset={{ top: 120, bottom: 136, left: 16, right: 320 }} />);
    const { tx, ty, scale } = readTransform();
    const availW = VIEWPORT.w - 16 - 320; // 1264
    const availH = VIEWPORT.h - 120 - 136; // 744
    expect(scale).toBeCloseTo(Math.min(availW / BOARD.w, availH / BOARD.h), 3);
    expect(tx).toBeCloseTo(16 + (availW - BOARD.w * scale) / 2, 1);
    expect(ty).toBeCloseTo(120 + (availH - BOARD.h * scale) / 2, 1);
    // the fit is the RESTING view — no "reset view" offered until the player moves
    expect(screen.queryByText("reset view")).toBeNull();
  });

  it("never fits below the zoom floor", () => {
    render(<Harness inset={{ top: 390, bottom: 390 }} />); // 220px of usable height
    expect(readTransform().scale).toBeGreaterThanOrEqual(ZOOM_MIN);
    expect(readTransform().scale).toBeLessThanOrEqual(ZOOM_MAX);
  });
});

describe("useZoomPan pan clamping (issue #450)", () => {
  it("keeps a slice of the board on screen no matter how far the drag goes", () => {
    render(<Harness />);
    const { scale } = readTransform();
    const boardW = BOARD.w * scale;
    const boardH = BOARD.h * scale;

    drag([500, 400], [100000, 100000]); // yanked far past the bottom-right corner
    const after = readTransform();
    // board's left/top edge can't pass the viewport edge minus the kept slice
    expect(after.tx).toBeLessThanOrEqual(VIEWPORT.w - Math.min(boardW * 0.25, VIEWPORT.w) + 0.5);
    expect(after.ty).toBeLessThanOrEqual(VIEWPORT.h - Math.min(boardH * 0.25, VIEWPORT.h) + 0.5);
    // ...and something is genuinely still visible in both axes
    expect(after.tx).toBeLessThan(VIEWPORT.w);
    expect(after.ty).toBeLessThan(VIEWPORT.h);
  });

  it("clamps the opposite direction too", () => {
    render(<Harness />);
    const { scale } = readTransform();
    const boardW = BOARD.w * scale;
    const boardH = BOARD.h * scale;

    drag([500, 400], [-100000, -100000]);
    const after = readTransform();
    // right/bottom edge stays inside the viewport by the kept slice
    expect(after.tx + boardW).toBeGreaterThanOrEqual(Math.min(boardW * 0.25, VIEWPORT.w) - 0.5);
    expect(after.ty + boardH).toBeGreaterThanOrEqual(Math.min(boardH * 0.25, VIEWPORT.h) - 0.5);
  });

  it("restores the initial fit via reset, and only offers it once moved off it", () => {
    render(<Harness inset={{ top: 120, bottom: 136, left: 16, right: 320 }} />);
    const fit = readTransform();
    expect(screen.queryByText("reset view")).toBeNull();

    drag([500, 400], [560, 470]);
    expect(readTransform()).not.toEqual(fit);
    const reset = screen.getByText("reset view");

    act(() => reset.click());
    const back = readTransform();
    expect(back.tx).toBeCloseTo(fit.tx, 1);
    expect(back.ty).toBeCloseTo(fit.ty, 1);
    expect(back.scale).toBeCloseTo(fit.scale, 3);
  });

  it("still moves the board for an ordinary short drag (no over-clamping)", () => {
    render(<Harness />);
    const before = readTransform();
    drag([500, 400], [540, 430]);
    const after = readTransform();
    expect(after.tx).toBeCloseTo(before.tx + 40, 1);
    expect(after.ty).toBeCloseTo(before.ty + 30, 1);
  });
});
