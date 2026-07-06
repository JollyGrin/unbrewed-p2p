import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
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

  it("greys out and disables a closed region's panel", () => {
    render(
      <ChakraProvider>
        <ProBoard map={REGION_MAP} fighters={[fighter({})]} closedRegions={["HUT"]} />
      </ChakraProvider>
    );
    const panel = screen.getByTitle("The Hut");
    const style = getComputedStyle(panel);
    expect(style.pointerEvents).toBe("none");
    expect(style.filter).toContain("grayscale");
    expect(screen.getByText(/The Hut — CLOSED/i)).toBeInTheDocument();
  });
});
