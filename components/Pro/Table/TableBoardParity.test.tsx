/**
 * Tabletop ↔ flat-board parity, round 2 (#895):
 *  1. a straddling LARGE miniature's HEAD base reports hover and marks itself
 *     a pick, as its tail and the flat board's head do;
 *  2. a sidekick carries its target chip, pick number and "reach 2" tag;
 *  3. a stacked piece's base lifts with its ground layer (TableStandeeAnchor);
 *  4. a walk / swap starts from the ring slot the piece LEFT, not the centre
 *     of its old space (on top of whatever still stands there).
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { TableBoard } from "./TableBoard";
import { TableStandeeAnchor } from "./TableStandeeAnchor";
import type { TableSidekickTokenProps } from "./TableSidekickToken";
import type { ProMapDef, ViewFighter } from "@/lib/pro/protocol";
import { stackLayout } from "@/lib/pro/tokenStack";

// Spy on the sidekick's props while still rendering the real component.
const sidekickProps: TableSidekickTokenProps[] = [];
jest.mock("./TableSidekickToken", () => {
  const actual = jest.requireActual("./TableSidekickToken");
  return {
    TableSidekickToken: (props: TableSidekickTokenProps) => {
      sidekickProps.push(props);
      return actual.TableSidekickToken(props);
    },
  };
});

/** TableBoard's DEFAULT_DIAMETER — the map below sets none. */
const DIAMETER = 0.021;
/** A 2:1 frame, so the y conversion of a slot offset matters. */
const FRAME_W = 1000;
const FRAME_H = 500;

const MAP: ProMapDef = {
  schemaVersion: "1",
  id: "parity-map",
  meta: { title: "Parity Map", minPlayers: 2, maxPlayers: 2, specialRules: false, imageUrl: "/test.png" },
  zones: [],
  spaces: [
    { id: "s1", x: 0.2, y: 0.3, zones: [], adjacentTo: ["s2"] },
    { id: "s2", x: 0.5, y: 0.5, zones: [], adjacentTo: ["s1", "s3"] },
    { id: "s3", x: 0.6, y: 0.5, zones: [], adjacentTo: ["s2", "s4"] },
    { id: "s4", x: 0.65, y: 0.65, zones: [], adjacentTo: ["s3"] },
  ],
};
const spaceOf = (id: string) => MAP.spaces.find((s) => s.id === id)!;

const fighter = (over: Partial<ViewFighter>): ViewFighter => ({
  id: "p1/hero",
  owner: "p1",
  kind: "HERO",
  name: "Gerry",
  space: "s2",
  tailSpace: null,
  hp: 10,
  maxHp: 10,
  reach: "MELEE",
  size: "NORMAL",
  defeated: false,
  ...over,
});
const larry = (n: number, over: Partial<ViewFighter> = {}) =>
  fighter({ id: `p1/larry-${n}`, kind: "SIDEKICK", name: `Larry ${n}`, size: "SMALL", hp: 1, maxHp: 1, ...over });

let restore: (() => void) | null = null;
beforeEach(() => {
  sidekickProps.length = 0;
  const w = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
  const h = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => FRAME_W });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => FRAME_H });
  const RO = (global as { ResizeObserver?: unknown }).ResizeObserver;
  (global as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  restore = () => {
    if (w) Object.defineProperty(HTMLElement.prototype, "offsetWidth", w);
    if (h) Object.defineProperty(HTMLElement.prototype, "offsetHeight", h);
    (global as { ResizeObserver?: unknown }).ResizeObserver = RO;
  };
});
afterEach(() => restore?.());

type BoardProps = Partial<React.ComponentProps<typeof TableBoard>>;
/** Renders, then waits a frame so positions come from the MEASURED frame. */
const renderBoard = async (props: BoardProps) => {
  const r = render(
    <ChakraProvider>
      <TableBoard map={MAP} fighters={[]} {...props} />
    </ChakraProvider>
  );
  await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
  return r;
};

/** Where the flat board centres a token with this slot, in board units. */
const flatBoardCentre = (spaceId: string, slot: { dx: number; dy: number }, scale: number) => {
  const s = spaceOf(spaceId);
  const w = DIAMETER * scale;
  return { x: s.x + (slot.dx / 100) * w, y: s.y + (slot.dy / 100) * w * (FRAME_W / FRAME_H) };
};

describe("TableBoard — a straddling LARGE miniature's head base (#895)", () => {
  const kong = fighter({ id: "p1/kong", name: "King Kong", space: "s3", tailSpace: "s4", size: "LARGE" });
  const figure = { anchor: { x: 0.5, y: 0.75 }, imageWidthMm: 80, footprintMm: 60, aspect: 1.5, url: "/figures/k.webp" };
  const headBase = (c: HTMLElement) => c.querySelector('[data-fighter-base][data-space-id="s3"]') as HTMLElement;
  const tailBase = (c: HTMLElement) => c.querySelector('[data-fighter-base][data-space-id="s4"]') as HTMLElement;

  it("reports hover the same as the tail does", async () => {
    const onFighterHover = jest.fn();
    const { container } = await renderBoard({ fighters: [kong], fighterFigure: () => figure, onFighterHover });
    expect(headBase(container)).not.toBeNull();

    fireEvent.mouseEnter(tailBase(container));
    expect(onFighterHover).toHaveBeenLastCalledWith("p1/kong");
    fireEvent.mouseLeave(tailBase(container));
    expect(onFighterHover).toHaveBeenLastCalledWith(null);
    onFighterHover.mockClear();

    fireEvent.mouseEnter(headBase(container));
    expect(onFighterHover).toHaveBeenLastCalledWith("p1/kong");
    fireEvent.mouseLeave(headBase(container));
    expect(onFighterHover).toHaveBeenLastCalledWith(null);
  });

  it("is hover-interactive (pointer events on) even when nothing is clickable", async () => {
    const { container } = await renderBoard({ fighters: [kong], fighterFigure: () => figure, onFighterHover: jest.fn() });
    expect(getComputedStyle(headBase(container)).pointerEvents).toBe("auto");
  });

  it("marks itself a live pick while the fighter is a target", async () => {
    const { container } = await renderBoard({
      fighters: [kong],
      fighterFigure: () => figure,
      highlightedFighters: ["p1/kong"],
      onFighterClick: jest.fn(),
    });
    expect(headBase(container).closest("[data-pick]")).not.toBeNull();
  });
});

describe("TableBoard — a sidekick target's pick marks (#895)", () => {
  const sk = larry(1, { owner: "p2", space: "s3", reach: "RANGED" });

  it("shows its bought-range chip", async () => {
    await renderBoard({
      fighters: [sk],
      highlightedFighters: [sk.id],
      boughtRangeTargets: [{ id: sk.id, chip: "−1 card to reach", blurb: "" }],
      onFighterClick: jest.fn(),
    });
    expect(screen.getByText("−1 card to reach")).toBeTruthy();
  });

  it("shows its pick number", async () => {
    const { container } = await renderBoard({ fighters: [sk], fighterBadges: { [sk.id]: 2 } });
    expect(container.querySelector('[data-pick-mark="number"]')?.textContent).toBe("2");
  });

  it("shows the reach-2 tag when it is an extended-reach target", async () => {
    await renderBoard({
      fighters: [sk],
      highlightedFighters: [sk.id],
      extendedReachTargets: [sk.id],
      onFighterClick: jest.fn(),
    });
    expect(screen.getByText("reach 2")).toBeTruthy();
  });
});

describe("TableStandeeAnchor — a stacked piece's base (#895)", () => {
  const baseOf = (liftPx: number) => {
    const { container } = render(
      <ChakraProvider>
        <TableStandeeAnchor
          x={0.5}
          y={0.5}
          tiltDeg={30}
          widthPx={40}
          heightPx={60}
          spaceDiamPx={30}
          stack={{ depthY: 0.5, order: 1, liftPx }}
          onClick={() => undefined}
        >
          {null}
        </TableStandeeAnchor>
      </ChakraProvider>
    );
    return container.querySelector("[data-fighter-base]") as HTMLElement;
  };

  it("lifts with the ground layer, so it is not buried under the token it rings onto", () => {
    expect(baseOf(7).style.transform).toContain("translateZ(7px)");
  });

  it("stays on the board when it is not lifted", () => {
    expect(baseOf(0).style.transform).not.toContain("translateZ");
  });
});

describe("TableBoard — relocations start from the slot the piece left (#895)", () => {
  const lastAnim = (id: string) => [...sidekickProps].reverse().find((p) => p.fighter.id === id)?.anim ?? null;

  it("a walk sets off from its ring slot on the shared space, not that space's centre", async () => {
    // Before the move Gerry and Larry 1 shared s2; Larry 1 has walked to s3.
    const before = [fighter({}), larry(1)];
    const slot = stackLayout(before.map((f) => ({ key: f.id, size: f.size! }))).get("p1/larry-1")!;
    const want = flatBoardCentre("s2", slot, slot.scale);
    await renderBoard({
      fighters: [fighter({}), larry(1, { space: "s3" })],
      pendingMove: { fighterId: "p1/larry-1", path: ["s2", "s3"] },
    });
    const anim = lastAnim("p1/larry-1")!;
    expect(anim).not.toBeNull();
    expect(anim.xs[0]).toBeCloseTo(want.x, 6);
    expect(anim.ys[0]).toBeCloseTo(want.y, 6);
    // …which really is off the centre, or the check is vacuous.
    expect(Math.abs(anim.xs[0] - 0.5) + Math.abs(anim.ys[0] - 0.5)).toBeGreaterThan(1e-4);
  });

  it("a swap fades out at the ring slot it held, not the old space's centre", async () => {
    // Before the swap Gerry, Larry 1 and Larry 2 shared s2; Larry 1 went to s3.
    const before = [fighter({}), larry(1), larry(2)];
    const slot = stackLayout(before.map((f) => ({ key: f.id, size: f.size! }))).get("p1/larry-1")!;
    const want = flatBoardCentre("s2", slot, slot.scale);
    await renderBoard({
      fighters: [fighter({}), larry(1, { space: "s3" }), larry(2)],
      swaps: [{ fighterId: "p1/larry-1", from: "s2", key: 1 }],
    });
    const anim = lastAnim("p1/larry-1")!;
    expect(anim?.opacity).toBeDefined();
    expect(anim.xs[0]).toBeCloseTo(want.x, 6);
    expect(anim.ys[0]).toBeCloseTo(want.y, 6);
    expect(Math.abs(anim.xs[0] - 0.5) + Math.abs(anim.ys[0] - 0.5)).toBeGreaterThan(1e-4);
  });

  it("a lone piece still sets off from its old space's centre", async () => {
    await renderBoard({
      fighters: [larry(1, { space: "s3" })],
      pendingMove: { fighterId: "p1/larry-1", path: ["s2", "s3"] },
    });
    const anim = lastAnim("p1/larry-1")!;
    expect(anim.xs[0]).toBeCloseTo(0.5, 6);
    expect(anim.ys[0]).toBeCloseTo(0.5, 6);
  });
});
