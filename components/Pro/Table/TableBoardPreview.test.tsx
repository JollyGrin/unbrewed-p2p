/**
 * The props TableBoard used to accept and drop (#871): the walk / effect-move
 * preview ghost (`previewMove`) and the atomic position-swap crossfade
 * (`swaps`, protocol v31). `tokenLife` is deliberately deferred — see
 * TableBoardDeferredProp — and enforced at compile time, not here.
 */
import { render } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { TableBoard } from "./TableBoard";
import { TableBoardLines } from "./TableBoardLines";
import type { TableStandeeAnchorProps } from "./TableStandeeAnchor";
import { ProMapDef, ViewFighter } from "@/lib/pro/protocol";
import { SWAP_SECONDS, SWAP_TIMES } from "@/lib/pro/positionSwap";

// Spy on every anchor's props (heroes, sidekicks, tails, ghosts all stand on
// one) while still rendering the real component.
const anchorProps: TableStandeeAnchorProps[] = [];
jest.mock("./TableStandeeAnchor", () => {
  const actual = jest.requireActual("./TableStandeeAnchor");
  return {
    ...actual,
    TableStandeeAnchor: (props: TableStandeeAnchorProps) => {
      anchorProps.push(props);
      return actual.TableStandeeAnchor(props);
    },
  };
});

const MAP: ProMapDef = {
  schemaVersion: "1",
  id: "test-map",
  meta: { title: "Test Map", minPlayers: 2, maxPlayers: 2, specialRules: false, imageUrl: "/test.png" },
  zones: [],
  spaces: [
    { id: "s1", x: 0.1, y: 0.1, zones: [], adjacentTo: ["s2"] },
    { id: "s2", x: 0.3, y: 0.3, zones: [], adjacentTo: ["s1", "s3"] },
    { id: "s3", x: 0.5, y: 0.5, zones: [], adjacentTo: ["s2", "s4"] },
    { id: "s4", x: 0.7, y: 0.6, zones: [], adjacentTo: ["s3", "s5"] },
    { id: "s5", x: 0.9, y: 0.8, zones: [], adjacentTo: ["s4"] },
  ],
};

const hero = (over: Partial<ViewFighter> = {}): ViewFighter => ({
  id: "p1/hero",
  owner: "p1",
  kind: "HERO",
  name: "King Kong",
  space: "s1",
  tailSpace: null,
  hp: 10,
  maxHp: 10,
  reach: "MELEE",
  size: "NORMAL",
  defeated: false,
  ...over,
});

const renderBoard = (props: Partial<React.ComponentProps<typeof TableBoard>> = {}) =>
  render(
    <ChakraProvider>
      <TableBoard map={MAP} fighters={[hero()]} {...props} />
    </ChakraProvider>
  );

const ghosts = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>("[data-move-ghost]"));

beforeEach(() => {
  anchorProps.length = 0;
});

describe("TableBoard previewMove ghost (#871)", () => {
  it("stands a ghost at the walk's CURRENT end space, while the real piece stays put", () => {
    const { container } = renderBoard({ previewMove: { fighterId: "p1/hero", path: ["s1", "s2", "s3"] } });
    const g = ghosts(container);
    expect(g).toHaveLength(1);
    expect(g[0].dataset.moveGhost).toBe("lead");
    expect(g[0].dataset.ghostSpaceId).toBe("s3");
    expect(g[0].style.left).toBe("50%");
    expect(g[0].style.top).toBe("50%");
    expect(g[0].textContent).toBe("KIN");
    // The real piece has not moved: its base is still on s1.
    expect(container.querySelector('[data-fighter-base][data-space-id="s1"]')).not.toBeNull();
  });

  it("follows each step and clears when the preview does (Commit / Cancel)", () => {
    const { container, rerender } = renderBoard({ previewMove: { fighterId: "p1/hero", path: ["s1", "s2"] } });
    expect(ghosts(container)[0].dataset.ghostSpaceId).toBe("s2");
    const again = (previewMove: React.ComponentProps<typeof TableBoard>["previewMove"]) =>
      rerender(
        <ChakraProvider>
          <TableBoard map={MAP} fighters={[hero()]} previewMove={previewMove} />
        </ChakraProvider>
      );
    again({ fighterId: "p1/hero", path: ["s1", "s2", "s3", "s4"] });
    expect(ghosts(container).map((g) => g.dataset.ghostSpaceId)).toEqual(["s4"]);
    again(null);
    expect(ghosts(container)).toHaveLength(0);
  });

  it("is inert, so a tap reaches the gold step highlight underneath", () => {
    const { container } = renderBoard({ previewMove: { fighterId: "p1/hero", path: ["s1", "s2"] } });
    expect(getComputedStyle(ghosts(container)[0]).pointerEvents).toBe("none");
  });

  it("ghosts BOTH spaces of a LARGE body", () => {
    const { container } = renderBoard({
      fighters: [hero({ space: "s2", tailSpace: "s1", size: "LARGE" })],
      previewMove: { fighterId: "p1/hero", path: ["s2", "s3", "s4"], trailPath: ["s1", "s2", "s3"] },
    });
    const byEnd = Object.fromEntries(ghosts(container).map((g) => [g.dataset.moveGhost, g.dataset.ghostSpaceId]));
    expect(byEnd).toEqual({ lead: "s4", trail: "s3" });
  });

  it("draws nothing for a path that does not resolve to board spaces", () => {
    const { container } = renderBoard({ previewMove: { fighterId: "p1/hero", path: ["s1", "nowhere", "s3"] } });
    expect(ghosts(container)).toHaveLength(0);
  });
});

describe("TableBoardLines preview route (#871)", () => {
  const spaces = MAP.spaces;
  it("draws the dashed route through every hop so far", () => {
    const { container } = render(
      <TableBoardLines spaces={spaces} frameW={1000} frameH={500} previewRoute={{ path: ["s1", "s2", "s3"], trail: null, color: "#E0A82E" }} />
    );
    const line = container.querySelector("[data-move-preview-route] polyline");
    expect(line?.getAttribute("points")).toBe("100,50 300,150 500,250");
    expect(container.querySelectorAll("[data-move-preview-route] line")).toHaveLength(0);
  });

  it("ties a LARGE body's ghost lead to its ghost trail with a band", () => {
    const { container } = render(
      <TableBoardLines spaces={spaces} frameW={1000} frameH={500} previewRoute={{ path: ["s2", "s3"], trail: "s2", color: "#3B8BEB" }} />
    );
    const band = container.querySelector("[data-move-preview-route] line");
    expect([band?.getAttribute("x1"), band?.getAttribute("y1"), band?.getAttribute("x2"), band?.getAttribute("y2")]).toEqual(["500", "250", "300", "150"]);
    expect(band?.getAttribute("stroke")).toBe("#3B8BEB");
  });

  it("draws no route without a preview", () => {
    const { container } = render(<TableBoardLines spaces={spaces} frameW={1000} frameH={500} />);
    expect(container.querySelector("[data-move-preview-route]")).toBeNull();
  });
});

describe("TableBoard swaps (protocol v31, #871)", () => {
  const heroAnchor = () => anchorProps.filter((p) => p["data-fighter-id"] === undefined && p.spaceId === "s3");

  it("crossfades a swapped piece from its pre-swap space instead of snapping", () => {
    renderBoard({ fighters: [hero({ space: "s3" })], swaps: [{ fighterId: "p1/hero", from: "s1", key: 1 }] });
    const anims = heroAnchor().map((p) => p.anim).filter(Boolean);
    expect(anims.length).toBeGreaterThan(0);
    expect(anims[anims.length - 1]).toEqual({
      xs: [0.1, 0.1, 0.5, 0.5],
      ys: [0.1, 0.1, 0.5, 0.5],
      times: SWAP_TIMES,
      opacity: [1, 0, 0, 1],
      durationSec: SWAP_SECONDS,
    });
  });

  it("never settles pendingMove off a swap (it is not a move)", () => {
    const onPendingMoveSettled = jest.fn();
    renderBoard({
      fighters: [hero({ space: "s3" })],
      swaps: [{ fighterId: "p1/hero", from: "s1", key: 1 }],
      onPendingMoveSettled,
    });
    for (const p of heroAnchor()) expect(p.onAnimComplete).toBeUndefined();
  });

  it("fades a LARGE body's tail from ITS own pre-swap space", () => {
    renderBoard({
      fighters: [hero({ space: "s3", tailSpace: "s4", size: "LARGE" })],
      swaps: [{ fighterId: "p1/hero", from: "s1", fromTail: "s2", key: 1 }],
    });
    const tail = anchorProps.filter((p) => p.spaceId === "s4" && p.anim);
    expect(tail.length).toBeGreaterThan(0);
    expect(tail[tail.length - 1].anim).toMatchObject({ xs: [0.3, 0.3, 0.7, 0.7], ys: [0.3, 0.3, 0.6, 0.6] });
  });

  it("leaves an unswapped piece static", () => {
    renderBoard({ fighters: [hero({ space: "s3" })], swaps: [{ fighterId: "p2/other", from: "s1", key: 1 }] });
    for (const p of heroAnchor()) expect(p.anim ?? null).toBeNull();
  });
});
