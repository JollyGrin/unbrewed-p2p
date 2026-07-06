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
