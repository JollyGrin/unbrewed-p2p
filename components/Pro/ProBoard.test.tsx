import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { ProBoard } from "./ProBoard";
import { ProMapDef, ViewFighter } from "@/lib/pro/protocol";

const MAP: ProMapDef = {
  schemaVersion: "1",
  id: "test-map",
  meta: { title: "Test Map", minPlayers: 2, maxPlayers: 2, specialRules: false, imageUrl: "/test.png" },
  zones: [],
  spaces: [
    { id: "s1", x: 0.2, y: 0.2, zones: [], adjacentTo: ["s2"], start: { slot: 1 } },
    { id: "s2", x: 0.8, y: 0.8, zones: [], adjacentTo: ["s1"], start: { slot: 2 } },
  ],
};

const fighter = (over: Partial<ViewFighter>): ViewFighter => ({
  id: "p1/hero",
  owner: "p1",
  kind: "HERO",
  name: "The Mandalorian",
  space: "s1",
  tailSpace: null,
  hp: 10,
  maxHp: 10,
  reach: "MELEE",
  defeated: false,
  ...over,
});

// Regression coverage for issue #129: a wrapper-sizing change (ba6e176) plus a
// component swap for framer-motion support (3dc3b75) silently dropped the
// fighter token's `display: flex`, so its centered `alignItems`/`justifyContent`
// went inert — initials rendered at the block-flow top instead of centered.
describe("ProBoard fighter token", () => {
  it("gives the token box display: flex so alignItems/justifyContent actually center the initials", () => {
    render(
      <ChakraProvider>
        <ProBoard map={MAP} fighters={[fighter({})]} />
      </ChakraProvider>
    );
    const token = screen.getByTitle(/The Mandalorian/);
    expect(getComputedStyle(token).display).toBe("flex");
  });

  it("never renders the literal word THE, even for a degenerate 'The'-only name", () => {
    render(
      <ChakraProvider>
        <ProBoard map={MAP} fighters={[fighter({ name: "The" })]} />
      </ChakraProvider>
    );
    const token = screen.getByTitle(/^The —/);
    expect(token.textContent).not.toMatch(/^THE/i);
  });

  it("still strips a real 'The ' prefix for normal hero names", () => {
    render(
      <ChakraProvider>
        <ProBoard map={MAP} fighters={[fighter({ name: "The Mandalorian" })]} />
      </ChakraProvider>
    );
    expect(screen.getByText("MAN")).toBeInTheDocument();
  });
});

// v9 board regions (Baba Yaga's Hut): region spaces render inside an inset
// panel with its own positioning frame; a closed region greys out and stops
// taking pointer events.
const REGION_MAP: ProMapDef = {
  ...MAP,
  regions: [{ id: "HUT", label: "The Hut", imageUrl: "/pro/regions/baba-yaga-hut.webp", spaceDiameter: 0.18 }],
  spaces: [
    ...MAP.spaces,
    { id: "hut-1", x: 0.28, y: 0.47, zones: [], adjacentTo: ["hut-2"], region: "HUT" },
    { id: "hut-2", x: 0.51, y: 0.33, zones: [], adjacentTo: ["hut-1"], region: "HUT" },
  ],
};

describe("ProBoard regions", () => {
  it("renders a region as an inset panel and puts a region-space fighter inside it", () => {
    render(
      <ChakraProvider>
        <ProBoard map={REGION_MAP} fighters={[fighter({ space: "hut-1" })]} />
      </ChakraProvider>
    );
    const panel = screen.getByTitle("The Hut");
    expect(panel).toContainElement(screen.getByAltText("The Hut")); // inset background art
    expect(panel).toContainElement(screen.getByTitle(/The Mandalorian/));
  });

  it("keeps main-board fighters out of the inset panel", () => {
    render(
      <ChakraProvider>
        <ProBoard map={REGION_MAP} fighters={[fighter({ space: "s1" })]} />
      </ChakraProvider>
    );
    expect(screen.getByTitle("The Hut")).not.toContainElement(screen.getByTitle(/The Mandalorian/));
  });

  it("greys out a closed region's panel and disables its art, but keeps the header live", () => {
    render(
      <ChakraProvider>
        <ProBoard map={REGION_MAP} fighters={[fighter({})]} closedRegions={["HUT"]} />
      </ChakraProvider>
    );
    const panel = screen.getByTitle("The Hut");
    expect(getComputedStyle(panel).filter).toContain("grayscale");
    // the art frame stops taking clicks…
    const artFrame = screen.getByAltText("The Hut").parentElement as HTMLElement;
    expect(getComputedStyle(artFrame).pointerEvents).toBe("none");
    // …but the header still works, so a dead panel can be collapsed/dragged away
    expect(getComputedStyle(panel).pointerEvents).toBe("auto");
    // case-sensitive: the overlay says "CLOSED"; the header chip says "closed"
    expect(screen.getByText(/The Hut — CLOSED/)).toBeInTheDocument();
  });

  it("collapses to just the header bar via the toggle, and re-expands", () => {
    render(
      <ChakraProvider>
        <ProBoard map={REGION_MAP} fighters={[fighter({ space: "hut-1" })]} />
      </ChakraProvider>
    );
    const toggle = screen.getByLabelText("toggle The Hut");
    fireEvent.click(toggle);
    expect(screen.queryByAltText("The Hut")).not.toBeInTheDocument(); // art gone, bar stays
    expect(screen.getByTitle("The Hut")).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByAltText("The Hut")).toBeInTheDocument();
  });

  it("auto-expands a collapsed panel while a space inside the region is highlighted", () => {
    const { rerender } = render(
      <ChakraProvider>
        <ProBoard map={REGION_MAP} fighters={[fighter({})]} />
      </ChakraProvider>
    );
    fireEvent.click(screen.getByLabelText("toggle The Hut"));
    expect(screen.queryByAltText("The Hut")).not.toBeInTheDocument();
    // legalActions now offer an interior destination -> the panel must open
    rerender(
      <ChakraProvider>
        <ProBoard map={REGION_MAP} fighters={[fighter({})]} highlightedSpaces={["hut-1"]} />
      </ChakraProvider>
    );
    expect(screen.getByAltText("The Hut")).toBeInTheDocument();
    // highlight gone -> the player's collapse preference comes back
    rerender(
      <ChakraProvider>
        <ProBoard map={REGION_MAP} fighters={[fighter({})]} />
      </ChakraProvider>
    );
    expect(screen.queryByAltText("The Hut")).not.toBeInTheDocument();
  });
});

// issue #120: pinch/scroll zoom + drag pan, gated behind the `zoomMap` flag.
// The frame (shrink-wrap box holding the art + every overlay) is transformed as
// one unit; the identity-based click model is untouched, so a click still lands
// the same action at any zoom/pan. `frame` = the img's parent positioning box.
const frameOf = () => screen.getByAltText("Test Map").parentElement as HTMLElement;

describe("ProBoard zoom/pan (issue #120)", () => {
  it("adds no transform and no reset control when zoomable is off (default)", () => {
    render(
      <ChakraProvider>
        <ProBoard map={MAP} fighters={[fighter({})]} onSpaceClick={() => {}} highlightedSpaces={["s2"]} />
      </ChakraProvider>
    );
    // no transform on the shrink-wrap frame — the board is untouched
    expect(["", "none"]).toContain(getComputedStyle(frameOf()).transform);
    // reset-to-fit control only exists once the feature is on AND off-identity
    expect(screen.queryByText("reset view")).not.toBeInTheDocument();
  });

  it("keeps identity-based clicks working when zoomable is on", () => {
    const onSpaceClick = jest.fn();
    render(
      <ChakraProvider>
        <ProBoard map={MAP} fighters={[fighter({})]} highlightedSpaces={["s2"]} onSpaceClick={onSpaceClick} zoomable />
      </ChakraProvider>
    );
    // the transform rides the frame (identity to start — same visual as off)
    expect(getComputedStyle(frameOf()).transform).toMatch(/scale|matrix/);
    // a plain click on the highlighted space still fires its action untouched:
    // no screen-coordinate math, so zoom/pan can't desync the hit target
    const circle = frameOf().querySelectorAll("div");
    // the highlighted hit-circle is the one wired with a pointer cursor
    const hit = [...circle].find((el) => getComputedStyle(el).cursor === "pointer");
    expect(hit).toBeTruthy();
    fireEvent.click(hit as HTMLElement);
    expect(onSpaceClick).toHaveBeenCalledWith("s2");
  });
});
