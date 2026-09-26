/**
 * A LARGE (two-space) fighter's band on the tabletop board (#868): the name
 * pill at the band's midpoint must paint above BOTH of the fighter's own
 * pieces, and only the HEAD segment may settle a pending move — a second,
 * late settle from the tail would clear a new incoming move.
 *
 * The plane is preserve-3d, so the browser orders the pill by 3D DEPTH, not
 * z-index (#899): the pill has to stand on its foot ABOVE the tokens' tops.
 * jsdom can't render that; the real pixels are checked by
 * scripts/visual-probe/tableTextOcclusion.cjs.
 */
import { render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { TableBoard } from "./TableBoard";
import type { TableFighterTailProps } from "./TableFighterTail";
import { ProMapDef, ViewFighter } from "@/lib/pro/protocol";
import { BAND_LABEL_CLEARANCE_PX, BAND_LABEL_OVER_BADGES_PX, standeeZIndex } from "@/lib/pro/tableProjection";

// Spy on the tail's props while still rendering the real component.
const tailProps: TableFighterTailProps[] = [];
jest.mock("./TableFighterTail", () => {
  const actual = jest.requireActual("./TableFighterTail");
  return {
    TableFighterTail: (props: TableFighterTailProps) => {
      tailProps.push(props);
      return actual.TableFighterTail(props);
    },
  };
});

const MAP: ProMapDef = {
  schemaVersion: "1",
  id: "test-map",
  meta: { title: "Test Map", minPlayers: 2, maxPlayers: 2, specialRules: false, imageUrl: "/test.png" },
  zones: [{ id: "fire", color: "#c0392b", label: "Fire" }],
  spaces: [
    { id: "s1", x: 0.2, y: 0.2, zones: ["fire"], adjacentTo: ["s2"] },
    { id: "s2", x: 0.3, y: 0.3, zones: ["fire"], adjacentTo: ["s1", "s3"] },
    { id: "s3", x: 0.5, y: 0.5, zones: [], adjacentTo: ["s2", "s4"] },
    { id: "s4", x: 0.35, y: 0.65, zones: [], adjacentTo: ["s3"] },
  ],
};

const kong: ViewFighter = {
  id: "p1/kong",
  owner: "p1",
  kind: "HERO",
  name: "King Kong",
  space: "s3",
  tailSpace: "s4",
  hp: 10,
  maxHp: 10,
  reach: "MELEE",
  size: "LARGE",
  defeated: false,
};

const renderKong = (props: Partial<React.ComponentProps<typeof TableBoard>> = {}) =>
  render(
    <ChakraProvider>
      <TableBoard map={MAP} fighters={[kong]} {...props} />
    </ChakraProvider>
  );

const zOf = (el: Element) => Number(getComputedStyle(el).zIndex);

/** How high above the board `el` sits: every translateZ on it and its ancestors. */
const heightPx = (el: Element | null): number => {
  let z = 0;
  for (let n = el as HTMLElement | null; n; n = n.parentElement) {
    for (const m of (n.style?.transform ?? "").matchAll(/translateZ\((-?[\d.]+)px\)/g)) z += Number(m[1]);
  }
  return z;
};
/** The top of the tallest piece inside `root` (its highest token layer). */
const topOf = (root: Element): number =>
  Math.max(heightPx(root), ...[...root.querySelectorAll("*")].map(heightPx));

beforeEach(() => {
  tailProps.length = 0;
});

describe("TableBoard LARGE fighter name pill", () => {
  // A real-sized frame, so tokens get their real thickness (a 0×0 jsdom frame
  // draws every token 1px thick and hides a missing stack lift).
  let restore: (() => void) | null = null;
  beforeEach(() => {
    const w = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
    const h = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 1200 });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 800 });
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

  it("paints above the standeeZIndex of both band ends", () => {
    renderKong();
    const pillZ = zOf(screen.getByText("King Kong"));
    // Head s3 (y 0.5), tail s4 (y 0.65) — the tail is the nearer end here.
    expect(pillZ).toBeGreaterThan(standeeZIndex(0.5));
    expect(pillZ).toBeGreaterThan(standeeZIndex(0.65));
  });

  it("paints above the fighter's own rendered head and tail anchors", () => {
    const { container } = renderKong();
    const pillZ = zOf(screen.getByText("King Kong"));
    const tail = container.querySelector('[data-fighter-id="p1/kong-tail"]')!;
    const head = container.querySelector('[data-fighter-id="p1/kong"]')!.closest("[title]")!;
    expect(zOf(tail)).toBeGreaterThan(0);
    expect(zOf(head)).toBeGreaterThan(0);
    expect(pillZ).toBeGreaterThan(zOf(tail));
    expect(pillZ).toBeGreaterThan(zOf(head));
  });

  it("stands on its foot above the tops of both band tokens, so depth can't sink it under them (#899)", () => {
    const { container } = renderKong();
    const pill = screen.getByText("King Kong");
    const head = container.querySelector('[data-fighter-id="p1/kong"]')!;
    const tail = container.querySelector('[data-fighter-id="p1/kong-tail"]')!;
    // Foot-pinned: a centre pivot sinks the pill's lower half into the board.
    expect(pill.style.transformOrigin).toBe("50% 100%");
    expect(topOf(head)).toBeGreaterThan(0);
    expect(topOf(tail)).toBeGreaterThan(0);
    expect(heightPx(pill)).toBeGreaterThan(topOf(head));
    expect(heightPx(pill)).toBeGreaterThan(topOf(tail));
  });

  it("clears a band end lifted by a shared-space stack", () => {
    const larry: ViewFighter = {
      id: "p2/larry",
      owner: "p2",
      kind: "SIDEKICK",
      name: "Larry",
      space: "s3",
      tailSpace: null,
      hp: 3,
      maxHp: 3,
      reach: "MELEE",
      size: "NORMAL",
      defeated: false,
    };
    const { container } = render(
      <ChakraProvider>
        <TableBoard map={MAP} fighters={[larry, kong]} />
      </ChakraProvider>
    );
    const head = container.querySelector('[data-fighter-id="p1/kong"]')!;
    const larryFace = container.querySelector('[data-fighter-id="p2/larry"]')!;
    // Kong's head is the lifted slot on s3 here, by more than the pill's own
    // clearance — otherwise the check is vacuous.
    expect(topOf(head)).toBeGreaterThan(topOf(larryFace) + BAND_LABEL_CLEARANCE_PX);
    expect(heightPx(screen.getByText("King Kong"))).toBeGreaterThan(topOf(head));
  });

  it("stands nearer the camera than the head token's slid badges, so they never cover it (#902)", () => {
    const { container } = renderKong();
    const pill = screen.getByText("King Kong");
    const slid = [...pill.style.transform.matchAll(/translate3d\([^,]+, [^,]+, (-?[\d.]+)px\)/g)];
    expect(slid).toHaveLength(1);
    const badges = container.querySelector('[data-badge-owner="p1/kong"] [data-standee-badges]')!;
    const badgesForward = Number(badges.getAttribute("data-badge-forward"));
    expect(badgesForward).toBeGreaterThan(0);
    expect(Number(slid[0][1])).toBeGreaterThanOrEqual(badgesForward + BAND_LABEL_OVER_BADGES_PX);
  });

  it("stays click-through, so a pick space under it still takes the tap", () => {
    renderKong();
    expect(getComputedStyle(screen.getByText("King Kong")).pointerEvents).toBe("none");
  });
});

describe("TableBoard LARGE fighter move settle", () => {
  it("never hands onPendingMoveSettled to the tail, even while the tail tweens", () => {
    const onPendingMoveSettled = jest.fn();
    renderKong({
      pendingMove: { fighterId: "p1/kong", path: ["s2", "s3"], trailPath: ["s1", "s2", "s4"] },
      onPendingMoveSettled,
    });
    expect(tailProps.length).toBeGreaterThan(0);
    // The tail really is animating this move — otherwise the check is vacuous.
    expect(tailProps.some((p) => p.anim)).toBe(true);
    for (const p of tailProps) expect(p.onAnimComplete).toBeUndefined();
  });
});
