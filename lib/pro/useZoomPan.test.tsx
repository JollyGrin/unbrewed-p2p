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
import { FIT_MIN, FOCUS_MAX_PICK_PX, ZOOM_MAX, ZOOM_MIN, ZoomPanInset, useZoomPan } from "./useZoomPan";

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

  // Issue #708: the FIT is allowed below the gesture floor, because a phone's
  // stage is genuinely smaller than a map — clamping it at ZOOM_MIN is exactly
  // what left the board cropped and adrift on a 390px screen.
  it("fits below the user zoom-out floor when that is what it takes", () => {
    render(<Harness inset={{ top: 390, bottom: 390 }} />); // 220px of usable height
    const { scale } = readTransform();
    expect(scale).toBeCloseTo(220 / BOARD.h, 3);
    expect(scale).toBeLessThan(ZOOM_MIN);
    expect(scale).toBeGreaterThanOrEqual(FIT_MIN);
    expect(scale).toBeLessThanOrEqual(ZOOM_MAX);
  });

  it("still refuses to zoom out past that fit", () => {
    render(<Harness inset={{ top: 390, bottom: 390 }} />);
    const fit = readTransform().scale;
    const vp = screen.getByTestId("viewport");
    act(() => {
      // a hard scroll-down = zoom out, well past any floor
      vp.dispatchEvent(
        new WheelEvent("wheel", { bubbles: true, deltaY: 5000, clientX: 800, clientY: 500 })
      );
    });
    expect(readTransform().scale).toBeCloseTo(fit, 3);
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

/** Harness variant exposing the auto-focus API (mobile step 1). */
type Box = { left: number; top: number; right: number; bottom: number };
const FocusHarness = ({ box, pick, next }: { box: Box; pick: number; next?: { box: Box; pick: number } }) => {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const zoom = useZoomPan(true, frameRef);
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
      <button onClick={() => zoom.focusOn(box, pick)}>focus</button>
      {next && <button onClick={() => zoom.focusOn(next.box, next.pick)}>focus next</button>}
      <button onClick={zoom.releaseFocus}>release</button>
    </div>
  );
};

describe("useZoomPan auto-focus on board picks (mobile step 1)", () => {
  // jsdom rects are all 0, so client coordinates equal container coordinates.
  const SMALL_PICKS = { left: 100, top: 100, right: 300, bottom: 300 };

  it("zooms onto small picks, capped at the maximum zoom, centred in the viewport", () => {
    render(<FocusHarness box={SMALL_PICKS} pick={20} />);

    act(() => screen.getByText("focus").click());

    const { tx, ty, scale } = readTransform();
    expect(scale).toBeCloseTo(ZOOM_MAX, 3);
    // box centre (200,200) lands on the viewport centre (800,500)
    // (fit is scale 1, tx 0, ty 50 — see the first fit test)
    expect(tx).toBeCloseTo(800 + ZOOM_MAX * (0 - 200), 1);
    expect(ty).toBeCloseTo(500 + ZOOM_MAX * (50 - 200), 1);
  });

  it("returns to the resting fit when the picks are released", () => {
    render(<FocusHarness box={SMALL_PICKS} pick={20} />);
    const fit = readTransform();

    act(() => screen.getByText("focus").click());
    act(() => screen.getByText("release").click());

    const back = readTransform();
    expect(back.scale).toBeCloseTo(fit.scale, 3);
    expect(back.tx).toBeCloseTo(fit.tx, 1);
    expect(back.ty).toBeCloseTo(fit.ty, 1);
  });

  it("leaves the view alone on release when the player moved it meanwhile", () => {
    render(<FocusHarness box={SMALL_PICKS} pick={20} />);

    act(() => screen.getByText("focus").click());
    drag([500, 400], [540, 430]);
    const moved = readTransform();
    act(() => screen.getByText("release").click());

    expect(readTransform()).toEqual(moved);
  });

  it("does not auto-zoom once the player has moved the view themselves", () => {
    render(<FocusHarness box={SMALL_PICKS} pick={20} />);
    drag([500, 400], [540, 430]);
    const moved = readTransform();

    act(() => screen.getByText("focus").click());

    expect(readTransform()).toEqual(moved);
  });

  it("does not zoom when the picks are touch-sized and spread over the board", () => {
    render(<FocusHarness box={{ left: 20, top: 20, right: 1580, bottom: 980 }} pick={60} />);
    const fit = readTransform();

    act(() => screen.getByText("focus").click());

    expect(readTransform()).toEqual(fit);
  });

  it("judges new picks against the resting fit, not the zoomed-in view", () => {
    // Zoomed onto small picks first; the next prompt's picks span the whole board.
    // On the ZOOMED screen they look big, but at the resting fit (scale 1, tx 0,
    // ty 50) they are touch-sized and spread — so the view returns to the fit.
    const Z = ZOOM_MAX;
    const zoomed = { scale: Z, tx: 800 + Z * (0 - 200), ty: 500 + Z * (50 - 200) };
    const fitSpread = { left: 20, top: 70, right: 1580, bottom: 930 };
    const onScreen = {
      left: zoomed.tx + Z * fitSpread.left,
      right: zoomed.tx + Z * fitSpread.right,
      top: zoomed.ty + Z * (fitSpread.top - 50),
      bottom: zoomed.ty + Z * (fitSpread.bottom - 50),
    };
    render(<FocusHarness box={SMALL_PICKS} pick={20} next={{ box: onScreen, pick: 60 * Z }} />);
    const fit = readTransform();

    act(() => screen.getByText("focus").click());
    expect(readTransform().scale).toBeCloseTo(Z, 3);
    act(() => screen.getByText("focus next").click());

    const back = readTransform();
    expect(back.scale).toBeCloseTo(fit.scale, 3);
    expect(back.tx).toBeCloseTo(fit.tx, 1);
    expect(back.ty).toBeCloseTo(fit.ty, 1);
  });

  it("stops zooming once the picks are comfortably tappable, keeping the surroundings in view", () => {
    // One 30px pick: filling the screen with it would lose the whole board.
    render(<FocusHarness box={{ left: 185, top: 185, right: 215, bottom: 215 }} pick={30} />);

    act(() => screen.getByText("focus").click());

    expect(readTransform().scale).toBeCloseTo(FOCUS_MAX_PICK_PX / 30, 3);
  });
});
