/**
 * Mobile step 1: actionable board circles are marked as picks, which is what the
 * auto-focus measures and what receives the enlarged touch hit area.
 */
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { ProBoard } from "./ProBoard";
import { ProMapDef, ViewFighter } from "@/lib/pro/protocol";
import { ZOOM_MAX } from "@/lib/pro/useZoomPan";

const MAP: ProMapDef = {
  schemaVersion: "1",
  id: "touch-map",
  meta: { title: "Touch Map", minPlayers: 2, maxPlayers: 2, specialRules: false, imageUrl: "/test.png" },
  zones: [],
  spaces: [
    { id: "s1", x: 0.2, y: 0.2, zones: [], adjacentTo: ["s2"], start: { slot: 1 } },
    { id: "s2", x: 0.8, y: 0.8, zones: [], adjacentTo: ["s1"], start: { slot: 2 } },
  ],
};

const enemy: ViewFighter = {
  id: "p2/hero",
  owner: "p2",
  kind: "HERO",
  name: "Baba Yaga",
  space: "s2",
  tailSpace: null,
  hp: 10,
  maxHp: 10,
  reach: "MELEE",
  size: "NORMAL",
  defeated: false,
};

const space = (container: HTMLElement, id: string) =>
  container.querySelector(`[data-space-id="${id}"]`) as HTMLElement;

describe("ProBoard board picks (mobile step 1)", () => {
  it("marks only actionable spaces as picks, and they stay clickable", () => {
    const onSpaceClick = jest.fn();
    const { container } = render(
      <ChakraProvider>
        <ProBoard map={MAP} fighters={[]} highlightedSpaces={["s1"]} onSpaceClick={onSpaceClick} />
      </ChakraProvider>
    );

    expect(space(container, "s1")).toHaveAttribute("data-pick");
    expect(space(container, "s2")).not.toHaveAttribute("data-pick");
    fireEvent.click(space(container, "s1"));
    expect(onSpaceClick).toHaveBeenCalledWith("s1");
  });

  it("does not mark gold spaces as picks when nothing can answer the click", () => {
    const { container } = render(
      <ChakraProvider>
        <ProBoard map={MAP} fighters={[]} highlightedSpaces={["s1"]} />
      </ChakraProvider>
    );

    expect(space(container, "s1")).not.toHaveAttribute("data-pick");
  });

  it("marks a clickable target token as a pick", () => {
    const { getByTitle } = render(
      <ChakraProvider>
        <ProBoard map={MAP} fighters={[enemy]} highlightedFighters={["p2/hero"]} onFighterClick={jest.fn()} />
      </ChakraProvider>
    );

    expect(getByTitle(/Baba Yaga/)).toHaveAttribute("data-pick");
  });

  it("renders and stays clickable on a touch screen (coarse pointer)", () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query === "(pointer: coarse)",
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    try {
      const onSpaceClick = jest.fn();
      const { container } = render(
        <ChakraProvider>
          <ProBoard map={MAP} fighters={[enemy]} highlightedSpaces={["s1"]} highlightedFighters={["p2/hero"]}
            onSpaceClick={onSpaceClick} onFighterClick={jest.fn()} zoomable />
        </ChakraProvider>
      );

      fireEvent.click(space(container, "s1"));
      expect(onSpaceClick).toHaveBeenCalledWith("s1");
    } finally {
      window.matchMedia = original;
    }
  });
});

// Auto-focus on a map with region inset panels (Baba Yaga's Hut, #834). In
// rotated portrait the panel is hoisted OUT of the transformed frame and pinned
// to the screen, so its picks sit at panel-relative screen spots: the focus box
// must be measured from the frame only, or the board zooms onto whatever lies
// under the panel instead of the real picks.
const REGION_MAP: ProMapDef = {
  ...MAP,
  regions: [{ id: "HUT", label: "The Hut", imageUrl: "/pro/regions/baba-yaga-hut.webp", spaceDiameter: 0.18 }],
  spaces: [
    ...MAP.spaces,
    { id: "hut-1", x: 0.28, y: 0.47, zones: [], adjacentTo: ["hut-2"], region: "HUT" },
    { id: "hut-2", x: 0.51, y: 0.33, zones: [], adjacentTo: ["hut-1"], region: "HUT" },
  ],
};

// jsdom has no ResizeObserver; the zoom hook fits the board when one fires, so
// the stub keeps every callback and lets the test fire them once sizes exist.
const resizeCallbacks: Array<() => void> = [];
class StubResizeObserver {
  constructor(private cb: () => void) {
    resizeCallbacks.push(cb);
  }
  observe() {}
  disconnect() {}
}

const size = (el: HTMLElement, box: "client" | "offset", w: number, h: number) => {
  Object.defineProperty(el, `${box}Width`, { value: w, configurable: true });
  Object.defineProperty(el, `${box}Height`, { value: h, configurable: true });
};

const rectAt = (el: HTMLElement, left: number, top: number, side: number) => {
  el.getBoundingClientRect = () =>
    ({ left, top, width: side, height: side, right: left + side, bottom: top + side, x: left, y: top }) as DOMRect;
};

/** translate(Xpx, Ypx) scale(S) [rotate…] -> {tx, ty, scale} (Chakra sets it via a class) */
const readTransform = (frame: HTMLElement) => {
  const t = getComputedStyle(frame).transform;
  const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/.exec(t);
  if (!m) throw new Error(`unparsable transform: ${t}`);
  return { tx: +m[1], ty: +m[2], scale: +m[3] };
};

// Let the board's post-paint measurement (a requestAnimationFrame) run.
const nextFrame = () => act(() => new Promise<void>((r) => requestAnimationFrame(() => r())));

describe("ProBoard auto-focus with region panels (#834)", () => {
  // A phone held upright: the viewport is 900×1600 and the landscape 1600×900
  // board takes its quarter-turn, so the resting fit is exactly scale 1 at (0, 0).
  const VIEWPORT = { w: 900, h: 1600 };
  const BOARD = { w: 1600, h: 900 };
  const S1 = { left: 100, top: 100, side: 20 }; // a small gold ring on the board
  const HUT_1 = { left: 8, top: 1200, side: 40 }; // inside the screen-pinned panel

  let originalMatchMedia: typeof window.matchMedia;
  let originalRO: unknown;
  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query === "(pointer: coarse)",
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    originalRO = (global as unknown as { ResizeObserver: unknown }).ResizeObserver;
    (global as unknown as { ResizeObserver: unknown }).ResizeObserver = StubResizeObserver;
    resizeCallbacks.length = 0;
  });
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    (global as unknown as { ResizeObserver: unknown }).ResizeObserver = originalRO;
  });

  /** Mounts the rotated, zoomable Hut board with no picks yet, sizes it, and
   *  fits it. Returns a rerender that switches the picks on. */
  const mountFitted = async () => {
    const onSpaceClick = jest.fn();
    const ui = (picks: string[]) => (
      <ChakraProvider>
        <ProBoard map={REGION_MAP} fighters={[]} highlightedSpaces={picks} onSpaceClick={onSpaceClick} zoomable rotated />
      </ChakraProvider>
    );
    const { container, rerender } = render(ui([]));
    const frame = screen.getByAltText("Touch Map").parentElement as HTMLElement;
    const viewport = frame.parentElement as HTMLElement;
    size(viewport, "client", VIEWPORT.w, VIEWPORT.h);
    size(frame, "offset", BOARD.w, BOARD.h);
    act(() => resizeCallbacks.forEach((cb) => cb()));
    await nextFrame();
    expect(readTransform(frame)).toEqual({ tx: 0, ty: 0, scale: 1 });
    rectAt(space(container, "s1"), S1.left, S1.top, S1.side);
    rectAt(space(container, "hut-1"), HUT_1.left, HUT_1.top, HUT_1.side);
    return { container, frame, showPicks: (picks: string[]) => rerender(ui(picks)) };
  };

  it("hoists the region panel out of the frame in rotated portrait (the layout under test)", async () => {
    const { container, frame, showPicks } = await mountFitted();
    showPicks(["s1", "hut-1"]);
    expect(space(container, "s1")).toHaveAttribute("data-pick");
    expect(space(container, "hut-1")).toHaveAttribute("data-pick");
    expect(frame.contains(space(container, "s1"))).toBe(true);
    expect(frame.contains(space(container, "hut-1"))).toBe(false);
    expect(space(container, "hut-1").closest("[data-region-panel]")).not.toBeNull();
  });

  it("zooms onto the board pick alone when the prompt also offers a hut space", async () => {
    const { frame, showPicks } = await mountFitted();
    showPicks(["s1", "hut-1"]);
    await nextFrame();

    // s1's centre (110, 110) lands on the viewport centre (450, 800) at the
    // maximum zoom — the hut pick's screen spot (far down, under the panel)
    // plays no part in the box, so the view is neither dragged toward it nor
    // zoomed out to span the two.
    const { tx, ty, scale } = readTransform(frame);
    expect(scale).toBeCloseTo(ZOOM_MAX, 3);
    expect(tx).toBeCloseTo(450 + ZOOM_MAX * (0 - 110), 1);
    expect(ty).toBeCloseTo(800 + ZOOM_MAX * (0 - 110), 1);
  });

  it("keeps the resting fit when every pick is inside the hut panel", async () => {
    const { frame, showPicks } = await mountFitted();
    showPicks(["hut-1", "hut-2"]);
    await nextFrame();

    // Nothing on the board itself to zoom onto: the panel is screen-pinned and
    // already tappable, so the board must not lurch onto whatever sits under it.
    expect(readTransform(frame)).toEqual({ tx: 0, ty: 0, scale: 1 });
  });
});
