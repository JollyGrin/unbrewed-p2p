/**
 * Click routing on the tabletop (#873). jsdom does no hit-testing, so these
 * assert the two things the browser's hit-test depends on: which elements
 * take pointer events at all (`effectivePointerEvents`, the inherited
 * `pointer-events` value) and how big each space's hit circle is. The real
 * `elementFromPoint` sweep lives in scripts/visual-probe/tableHitTest.cjs.
 */
import { fireEvent, render } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { TableBoard } from "./TableBoard";
import { TableStandeeAnchor } from "./TableStandeeAnchor";
import { ProMapDef, ViewFighter, ViewToken } from "@/lib/pro/protocol";

/** `pointer-events` inherits: the first ancestor-or-self that sets it wins. */
const effectivePointerEvents = (el: Element | null): string => {
  for (let node = el; node; node = node.parentElement) {
    const v = getComputedStyle(node).pointerEvents;
    if (v) return v;
  }
  return "auto";
};

const MAP: ProMapDef = {
  schemaVersion: "1",
  id: "click-map",
  meta: { title: "Click Map", minPlayers: 2, maxPlayers: 2, specialRules: false, imageUrl: "/test.png", spaceDiameter: 0.04 },
  zones: [{ id: "fire", color: "#c0392b", label: "Fire" }],
  items: [{ id: "it1", kind: "combat", label: "Sword", value: 1 }],
  spaces: [
    // Far rank (y=0.1, heavy depth padding), 1.2 diameters apart.
    { id: "a", x: 0.3, y: 0.1, zones: ["fire"], adjacentTo: ["b"] },
    { id: "b", x: 0.348, y: 0.1, zones: ["fire"], adjacentTo: ["a"] },
    { id: "s3", x: 0.5, y: 0.5, zones: [], adjacentTo: ["s4"] },
    { id: "s4", x: 0.5, y: 0.8, zones: [], adjacentTo: ["s3"], passage: true },
  ],
};

const fighter = (over: Partial<ViewFighter>): ViewFighter => ({
  id: "p1/hero",
  owner: "p1",
  kind: "HERO",
  name: "The Mandalorian",
  space: "s3",
  tailSpace: null,
  hp: 10,
  maxHp: 10,
  reach: "MELEE",
  size: "NORMAL",
  defeated: false,
  ...over,
});
const kong = fighter({ id: "p1/kong", name: "King Kong", space: "s3", tailSpace: "s4", size: "LARGE" });
const figure = { anchor: { x: 0.5, y: 0.75 }, imageWidthMm: 80, footprintMm: 60, aspect: 1.5, url: "/figures/x.p1.webp" };

const renderBoard = (props: Partial<React.ComponentProps<typeof TableBoard>> = {}) =>
  render(
    <ChakraProvider>
      <TableBoard map={MAP} fighters={[]} {...props} />
    </ChakraProvider>
  );

const hitCircle = (container: HTMLElement, id: string) =>
  container.querySelector(`[title="${id}"][data-space-id="${id}"]`) as HTMLElement;

describe("#873 fix 1 — standee boxes don't swallow taps", () => {
  it("the anchor's root and upright wrapper take no pointer events", () => {
    const { container } = render(
      <ChakraProvider>
        <TableStandeeAnchor x={0.5} y={0.5} tiltDeg={48} widthPx={60} heightPx={90} spaceDiamPx={40} onClick={jest.fn()}>
          <div data-testid="plate" />
        </TableStandeeAnchor>
      </ChakraProvider>
    );
    const plate = container.querySelector('[data-testid="plate"]')!;
    const upright = container.querySelector("[data-standee-upright]")!;
    expect(getComputedStyle(upright).pointerEvents).toBe("none");
    expect(getComputedStyle(upright.parentElement!).pointerEvents).toBe("none");
    expect(effectivePointerEvents(plate)).toBe("none");
  });

  it("a piece with a tap handler takes taps on its in-plane base (its own space only)", () => {
    const { container } = render(
      <ChakraProvider>
        <TableStandeeAnchor x={0.5} y={0.5} tiltDeg={48} widthPx={60} heightPx={90} spaceDiamPx={40} onClick={jest.fn()}>
          {null}
        </TableStandeeAnchor>
      </ChakraProvider>
    );
    expect(effectivePointerEvents(container.querySelector("[data-fighter-base]"))).toBe("auto");
  });

  it("an inert piece (the walk ghost, #871) never opts its base back in, even with a handler", () => {
    const { container } = render(
      <ChakraProvider>
        <TableStandeeAnchor x={0.5} y={0.5} tiltDeg={48} widthPx={60} heightPx={90} spaceDiamPx={40} onClick={jest.fn()} inert>
          {null}
        </TableStandeeAnchor>
      </ChakraProvider>
    );
    expect(effectivePointerEvents(container.querySelector("[data-fighter-base]"))).toBe("none");
  });

  it("a board object takes no taps anywhere — it never hides the space it stands on", () => {
    const token: ViewToken = { id: "t1", kind: "totem", owner: "p1", space: "s3" };
    const { container } = renderBoard({ tokens: [token] });
    const anchor = container.querySelector('[data-fighter-base][data-space-id="s3"]')!.parentElement!;
    const all = [anchor, ...Array.from(anchor.querySelectorAll("*"))];
    expect(all.map(effectivePointerEvents).filter((v) => v !== "none")).toEqual([]);
  });

  it("a miniature's tall plate and body pass taps through while the fighter isn't a target", () => {
    const { container } = renderBoard({
      fighters: [fighter({})],
      fighterFigure: () => figure,
      highlightedSpaces: ["s3"],
      onSpaceClick: jest.fn(),
    });
    const plate = container.querySelector('[data-fighter-id="p1/hero"]')!;
    expect(effectivePointerEvents(plate)).toBe("none");
    expect(effectivePointerEvents(container.querySelector("img[data-table-figure]"))).toBe("none");
    // …but its base, on its own space, still commits that space (fallback).
    const base = container.querySelector('[data-fighter-base][data-space-id="s3"]')!;
    expect(effectivePointerEvents(base)).toBe("auto");
  });

  it("a targetable miniature's body takes taps", () => {
    const { container } = renderBoard({
      fighters: [fighter({})],
      fighterFigure: () => figure,
      highlightedFighters: ["p1/hero"],
      onFighterClick: jest.fn(),
    });
    expect(effectivePointerEvents(container.querySelector("img[data-table-figure]"))).toBe("auto");
  });

  it("…but not while spaces are picks too: the body stands over them, so the base takes the fighter's taps", () => {
    const onFighterClick = jest.fn();
    const { container } = renderBoard({
      fighters: [fighter({})],
      fighterFigure: () => figure,
      highlightedFighters: ["p1/hero"],
      highlightedSpaces: ["s4"],
      onFighterClick,
      onSpaceClick: jest.fn(),
    });
    expect(effectivePointerEvents(container.querySelector("img[data-table-figure]"))).toBe("none");
    const base = container.querySelector('[data-fighter-base][data-space-id="s3"]')!;
    expect(effectivePointerEvents(base)).toBe("auto");
    fireEvent.click(base);
    expect(onFighterClick).toHaveBeenCalledWith("p1/hero");
  });
  it("on a SHARED space (#872's ring slots), the fighter's face commits the space and the totem beside it takes nothing", () => {
    const onSpaceClick = jest.fn();
    const token: ViewToken = { id: "t1", kind: "totem", owner: "p1", space: "s3" };
    const { container } = renderBoard({
      fighters: [fighter({})],
      tokens: [token],
      highlightedSpaces: ["s3"],
      onSpaceClick,
    });
    const face = container.querySelector('[data-standee-ground] [data-fighter-id="p1/hero"]')!;
    expect(effectivePointerEvents(face)).toBe("auto");
    fireEvent.click(face);
    expect(onSpaceClick).toHaveBeenCalledWith("s3");
    // Every upright plate on the space lets the pointer through.
    const plates = Array.from(container.querySelectorAll("[data-standee-upright]"));
    expect(plates.length).toBeGreaterThan(1);
    expect(plates.map(effectivePointerEvents)).toEqual(plates.map(() => "none"));
    // The totem's whole piece is inert.
    const totemBase = Array.from(container.querySelectorAll('[data-fighter-base][data-space-id="s3"]')).find(
      (b) => !b.closest("[data-standee-ground]")
    )!;
    const totem = totemBase.parentElement!;
    expect([totem, ...Array.from(totem.querySelectorAll("*"))].map(effectivePointerEvents).filter((v) => v !== "none")).toEqual([]);
  });
});

describe("#873 fix 2 — adjacent tap areas never overlap", () => {
  const realMatchMedia = window.matchMedia;
  const realRO = (window as { ResizeObserver?: unknown }).ResizeObserver;
  const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
  const height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
  const setPointer = (coarse: boolean) => {
    window.matchMedia = ((query: string) => ({
      matches: coarse && query === "(pointer: coarse)",
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
  };
  beforeEach(() => {
    // A measured 1000 × 1000 frame, so the space diameter is 40px.
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 1000 });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 1000 });
    (window as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      disconnect() {}
    };
  });
  afterEach(() => {
    window.matchMedia = realMatchMedia;
    (window as { ResizeObserver?: unknown }).ResizeObserver = realRO;
    if (width) Object.defineProperty(HTMLElement.prototype, "offsetWidth", width);
    if (height) Object.defineProperty(HTMLElement.prototype, "offsetHeight", height);
  });

  it("on touch, caps each padded hit circle at the distance to the nearest other pick", () => {
    setPointer(true);
    const { container } = renderBoard({ highlightedSpaces: ["a", "b"], onSpaceClick: jest.fn() });
    // a and b are 48px apart; unpadded disc 40px, depth-padded ~87px.
    for (const id of ["a", "b"]) {
      const w = parseFloat(hitCircle(container, id).style.width || getComputedStyle(hitCircle(container, id)).width);
      expect(w).toBeCloseTo(48, 1);
    }
  });

  it("still pads a lone pick for depth on touch", () => {
    setPointer(true);
    const { container } = renderBoard({ highlightedSpaces: ["a"], onSpaceClick: jest.fn() });
    const w = parseFloat(getComputedStyle(hitCircle(container, "a")).width);
    expect(w).toBeGreaterThan(80);
  });

  it("with a mouse, a hit circle is exactly the visible disc", () => {
    setPointer(false);
    const { container } = renderBoard({ highlightedSpaces: ["a"], onSpaceClick: jest.fn() });
    expect(parseFloat(getComputedStyle(hitCircle(container, "a")).width)).toBeCloseTo(40, 1);
  });
});

describe("#873 fix 3 — a LARGE fighter's tail doesn't block its own space", () => {
  it("tapping the tail on a highlighted tail space commits that space", () => {
    const onSpaceClick = jest.fn();
    const onFighterClick = jest.fn();
    const { container } = renderBoard({ fighters: [kong], highlightedSpaces: ["s4"], onSpaceClick, onFighterClick });
    fireEvent.click(container.querySelector("[data-tail-body]")!);
    expect(onSpaceClick).toHaveBeenCalledWith("s4");
    expect(onFighterClick).not.toHaveBeenCalled();
  });

  it("a targetable fighter's tail still targets the fighter", () => {
    const onSpaceClick = jest.fn();
    const onFighterClick = jest.fn();
    const { container } = renderBoard({
      fighters: [kong],
      highlightedSpaces: ["s4"],
      highlightedFighters: ["p1/kong"],
      onSpaceClick,
      onFighterClick,
    });
    fireEvent.click(container.querySelector("[data-tail-body]")!);
    expect(onFighterClick).toHaveBeenCalledWith("p1/kong");
    expect(onSpaceClick).not.toHaveBeenCalled();
  });

  it("a straddling miniature's bases commit their own spaces", () => {
    const onSpaceClick = jest.fn();
    const { container } = renderBoard({
      fighters: [kong],
      fighterFigure: () => figure,
      highlightedSpaces: ["s3", "s4"],
      onSpaceClick,
    });
    fireEvent.click(container.querySelector('[data-fighter-base][data-space-id="s4"]')!);
    expect(onSpaceClick).toHaveBeenLastCalledWith("s4");
    fireEvent.click(container.querySelector('[data-fighter-base][data-space-id="s3"]')!);
    expect(onSpaceClick).toHaveBeenLastCalledWith("s3");
  });
});

describe("#873 fix 4 — item and passage badges are inspectable", () => {
  it("renders the badge outside the space's hit circle, taking its own taps", () => {
    const { container } = renderBoard({ itemTokens: { s3: "it1" } });
    const badge = container.querySelector('[data-space-badge="s3"]')!;
    expect(badge).toBeTruthy();
    expect(badge.closest('[data-space-id="s3"]')).toBeNull();
    // s3 isn't a pick, so its hit circle is inert — the badge must not be.
    expect(effectivePointerEvents(hitCircle(container, "s3"))).toBe("none");
    expect(effectivePointerEvents(badge.querySelector('[role="button"]'))).toBe("auto");
  });

  it("tapping the badge of a highlighted space opens it without committing the move", () => {
    const onSpaceClick = jest.fn();
    const { container } = renderBoard({ itemTokens: { s3: "it1" }, highlightedSpaces: ["s3"], onSpaceClick });
    fireEvent.click(container.querySelector('[data-space-badge="s3"] [role="button"]')!);
    expect(onSpaceClick).not.toHaveBeenCalled();
  });

  it("gives a secret passage the same beside-the-disc badge", () => {
    const { container } = renderBoard();
    const badge = container.querySelector('[data-space-badge="s4"]')!;
    expect(badge.closest('[data-space-id="s4"]')).toBeNull();
    expect(effectivePointerEvents(badge)).toBe("auto");
  });
});

describe("#873 — the board plane never wins a coplanar hit-test", () => {
  it("takes the stage plane and the board image out of hit-testing, leaving picks tappable", () => {
    const { container } = renderBoard({ highlightedSpaces: ["a"], onSpaceClick: jest.fn() });
    const plane = container.querySelector("[data-table-stage-plane]")!;
    expect(getComputedStyle(plane).pointerEvents).toBe("none");
    expect(effectivePointerEvents(plane.querySelector('img[alt="Click Map"]'))).toBe("none");
    expect(effectivePointerEvents(hitCircle(container, "a"))).toBe("auto");
  });
});
