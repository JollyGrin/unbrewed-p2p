/**
 * TableStage composes the flat board's own `useZoomPan` (untouched) with the
 * perspective/tilt rig. These tests check the composition holds together —
 * the ground image renders, the render-prop children receive real measured
 * metrics, and the tilt lands on a DIFFERENT element than the one useZoomPan
 * drives (see TableStage's header comment for why that separation matters).
 */
import { act, render, screen } from "@testing-library/react";
import { useReducedMotion } from "framer-motion";
import { TableStage } from "./TableStage";
import { DEFAULT_TILT_DEG, PERSPECTIVE_RATIO, TABLE_YAW_DEG, boardTransform } from "@/lib/pro/tableProjection";

// TableStage's only use of framer-motion is `useReducedMotion` (phase-5
// target #5's gate). Mocking the module directly — rather than driving the
// real hook via `window.matchMedia` — sidesteps that hook's own module-level
// "have we already initialized" latch (see framer-motion's
// `initPrefersReducedMotion`), which only ever runs ONCE per test file and
// would otherwise make the "on" and "off" cases order-dependent on which
// test happens to render first.
jest.mock("framer-motion", () => ({
  // Chakra itself depends on other framer-motion exports (`motion`,
  // `AnimatePresence`, ...) internally — spread the REAL module through and
  // override only the one hook this test file needs to control.
  ...jest.requireActual("framer-motion"),
  useReducedMotion: jest.fn(() => false),
}));

// jsdom reports every layout box as 0×0; stub just enough of ResizeObserver +
// offsetWidth/Height for TableStage's frameW/frameH measurement to run, the
// same trick lib/pro/useZoomPan.test.tsx uses for the hook it wraps.
class StubResizeObserver {
  constructor(private cb: () => void) {}
  observe() {
    this.cb();
  }
  disconnect() {}
}
(global as unknown as { ResizeObserver: unknown }).ResizeObserver = StubResizeObserver;

describe("TableStage", () => {
  it("renders the board image as the ground plane", () => {
    render(
      <TableStage imageUrl="/board.png" imageAlt="Test board">
        {() => null}
      </TableStage>
    );
    // Two copies exist (the invisible sizing spacer + the visible tilted
    // ground art) — both point at the same map image.
    const images = screen.getAllByAltText(/Test board|^$/, { exact: false }) as HTMLImageElement[];
    expect(images.some((img) => img.src.endsWith("/board.png"))).toBe(true);
  });

  it("hands the render-prop children the default tilt when none is given", () => {
    let seenTilt: number | undefined;
    render(
      <TableStage imageUrl="/board.png" imageAlt="Test board">
        {({ tiltDeg }) => {
          seenTilt = tiltDeg;
          return null;
        }}
      </TableStage>
    );
    expect(seenTilt).toBe(DEFAULT_TILT_DEG);
  });

  it("puts the tilt (+ default yaw) transform on a data-table-stage-plane element, never on the pan/zoom frame itself", () => {
    const { container } = render(
      <TableStage imageUrl="/board.png" imageAlt="Test board" zoomable tiltDeg={40}>
        {() => null}
      </TableStage>
    );
    const plane = container.querySelector("[data-table-stage-plane]") as HTMLElement;
    expect(plane.style.transform).toBe(boardTransform(40, TABLE_YAW_DEG));
  });

  it("measures the frame's layout width/height and passes them to children", () => {
    // jsdom reports 0 for every element's layout box; stub it at the prototype
    // level so it is in place before TableStage's mount-time ResizeObserver
    // (which fires synchronously in the stub above) ever reads it.
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", { value: 800, configurable: true });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", { value: 600, configurable: true });
    try {
      let seen: { frameW: number; frameH: number } | undefined;
      render(
        <TableStage imageUrl="/board.png" imageAlt="Test board">
          {(m) => {
            seen = m;
            return null;
          }}
        </TableStage>
      );
      // The rig itself too (#931): a WebGL mini matches the CSS camera from it.
      expect(seen).toEqual({ frameW: 800, frameH: 600, tiltDeg: DEFAULT_TILT_DEG, yawDeg: TABLE_YAW_DEG, perspectiveRatio: PERSPECTIVE_RATIO, screenScale: 1 });
    } finally {
      delete (HTMLElement.prototype as { offsetWidth?: number }).offsetWidth;
      delete (HTMLElement.prototype as { offsetHeight?: number }).offsetHeight;
    }
  });
});

/**
 * Phase-3 fault #2 — "the tilted view zooms in far past useful". A depth-
 * varying pick set (a tiny far pick alongside a big near pick, on the SAME
 * prompt) used to drive the zoom ceiling off the smallest pick alone, which
 * tried to blow the far pick up to a comfortable size and took the near pick
 * — and the board itself — off the edge of the screen with it. This exercises
 * the real `useZoomPan` end to end (same technique as
 * ProBoard.touch.test.tsx's own auto-focus coverage), so a regression here
 * would show up as an actual, wrong on-screen transform, not just a changed
 * function call.
 */
describe("TableStage auto-focus with a depth-varying pick set (phase-3 fault #2)", () => {
  // Chosen so the resting fit is exactly scale 1 — same dimensions as
  // useZoomPan.test.tsx's own focus tests, for numbers that are easy to
  // reason about.
  const VIEWPORT = { w: 1600, h: 1000 };
  const BOARD = { w: 1600, h: 900 };

  let originalMatchMedia: typeof window.matchMedia;
  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
    // "coarse pointer" is the effect's own gate — a mouse/trackpad session
    // never auto-focuses at all, matching ProBoard's own behaviour.
    window.matchMedia = ((query: string) => ({
      matches: query === "(pointer: coarse)",
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    // Stubbed at the PROTOTYPE level (not per-element) so it is already in
    // place before TableStage's own mount-time ResizeObserver — which the
    // top-of-file StubResizeObserver fires synchronously on `.observe()` —
    // ever reads it, exactly like the "measures the frame's layout
    // width/height" test above.
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", { value: BOARD.w, configurable: true });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", { value: BOARD.h, configurable: true });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { value: VIEWPORT.w, configurable: true });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { value: VIEWPORT.h, configurable: true });
  });
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    delete (HTMLElement.prototype as { offsetWidth?: number }).offsetWidth;
    delete (HTMLElement.prototype as { offsetHeight?: number }).offsetHeight;
    delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
    delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight;
  });

  const rectAt = (el: HTMLElement, left: number, top: number, w: number, h: number) => {
    el.getBoundingClientRect = () =>
      ({ left, top, width: w, height: h, right: left + w, bottom: top + h, x: left, y: top }) as DOMRect;
  };
  const readScale = (frame: HTMLElement): number => {
    const t = getComputedStyle(frame).transform;
    const m = /scale\(([\d.]+)\)/.exec(t);
    if (!m) throw new Error(`unparsable transform: ${t}`);
    return +m[1];
  };
  // Let the effect's own requestAnimationFrame (post-paint measurement) run.
  const nextFrame = () => act(() => new Promise<void>((r) => requestAnimationFrame(() => r())));

  it("stays at the resting fit — does not balloon the zoom — when a tiny far pick shares the prompt with a big near pick", async () => {
    const { container } = render(
      <TableStage imageUrl="/board.png" imageAlt="Test board" zoomable pickKey="a">
        {() => (
          <>
            {/* A far-rank pick: tiny, well under the touch minimum. Alone,
                this would zoom in hard trying to make it tappable. */}
            <div data-pick="" ref={(el) => el && rectAt(el, 200, 150, 15, 15)} />
            {/* A near-rank pick on the SAME prompt: already comfortably
                tappable. The ceiling must be judged against THIS pick, not
                the tiny one above, or the fix in tableProjection.ts's
                `tableFocusCapDiameterPx` isn't actually wired up. */}
            <div data-pick="" ref={(el) => el && rectAt(el, 785, 735, 70, 70)} />
          </>
        )}
      </TableStage>
    );
    await nextFrame();

    const plane = container.querySelector("[data-table-stage-plane]") as HTMLElement;
    // frameRef is TWO levels above the tilted stage plane: the perspective
    // wrapper, then the pan/zoom frame itself (see TableStage's own header
    // comment on why the tilt and the zoom transform live on different
    // elements).
    const frame = plane.parentElement!.parentElement as HTMLElement;
    // The resting fit here is scale 1 (BOARD fills VIEWPORT exactly on the
    // narrower axis) — the regression this guards is a scale that ballooned
    // toward the OLD ceiling (FOCUS_MAX_PICK_PX / 15 ≈ 4.3, clamped to
    // ZOOM_MAX = 3): comfortably distinguishable from "stayed at rest".
    expect(readScale(frame)).toBeCloseTo(1, 1);
  });
});

describe("camera yaw (phase-5 target #5 — 'not perfectly square to the viewer')", () => {
  afterEach(() => {
    (useReducedMotion as jest.Mock).mockReturnValue(false);
  });

  it("applies TABLE_YAW_DEG when the player has not asked for reduced motion", () => {
    (useReducedMotion as jest.Mock).mockReturnValue(false);
    const { container } = render(
      <TableStage imageUrl="/board.png" imageAlt="Test board" tiltDeg={40}>
        {() => null}
      </TableStage>
    );
    const plane = container.querySelector("[data-table-stage-plane]") as HTMLElement;
    expect(plane.style.transform).toContain("rotateY");
    expect(plane.style.transform).toBe(boardTransform(40, TABLE_YAW_DEG));
  });

  it("drops the yaw entirely under prefers-reduced-motion — renders byte-identical to the tilt-only transform", () => {
    (useReducedMotion as jest.Mock).mockReturnValue(true);
    const { container } = render(
      <TableStage imageUrl="/board.png" imageAlt="Test board" tiltDeg={40}>
        {() => null}
      </TableStage>
    );
    const plane = container.querySelector("[data-table-stage-plane]") as HTMLElement;
    expect(plane.style.transform).not.toContain("rotateY");
    expect(plane.style.transform).toBe(boardTransform(40));
  });
});

describe("TableBoardEdge (phase-5 target #1 — 'the board has no thickness')", () => {
  it("renders inside the same stage plane the board image and its tilt live in", () => {
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", { value: 800, configurable: true });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", { value: 300, configurable: true });
    try {
      const { container } = render(
        <TableStage imageUrl="/board.png" imageAlt="Test board">
          {() => null}
        </TableStage>
      );
      const plane = container.querySelector("[data-table-stage-plane]") as HTMLElement;
      // The edge face is the extruded flap: hinged at the plane's own bottom
      // edge and folded with rotateX(-EDGE_FOLD_DEG deg) — see
      // TableBoardEdge.tsx's own header for why that combination, applied
      // inside this SAME preserve-3d plane, is what gives the board a real
      // side rather than a texture.
      const edge = Array.from(plane.children).find(
        (el) => (el as HTMLElement).style.transform === "rotateX(-45deg)"
      ) as HTMLElement | undefined;
      expect(edge).toBeTruthy();
      expect(edge!.style.transformOrigin).toBe("top");
    } finally {
      delete (HTMLElement.prototype as { offsetWidth?: number }).offsetWidth;
      delete (HTMLElement.prototype as { offsetHeight?: number }).offsetHeight;
    }
  });
});
