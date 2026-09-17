import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { ProBoard } from "./ProBoard";
import { ProMapDef, ViewFighter } from "@/lib/pro/protocol";

/**
 * A LARGE (two-space) fighter's head and tail tokens have to read as ONE
 * fighter — real player feedback: two same-color, same-initial circles
 * joined by a thin band still read as two separate fighters at phone zoom,
 * and since a LARGE attacker's melee reach is 2 spaces (largeReach.ts),
 * either circle can be a live attack target, so "which one is actually
 * Appa" was a genuine in-play question, not just a cosmetic nit.
 *
 * This file covers the two things that make the pair read as one:
 *   1. an identity label anchored to the band itself (bandLabelText/bandMidpoint
 *      in lib/pro/twoSpaceBand.ts — unit tested there);
 *   2. targeting/selection/hover state applying IDENTICALLY to both segments,
 *      so tapping either one is obviously "the same fighter, same effect".
 */

const MAP: ProMapDef = {
  schemaVersion: "1",
  id: "test-map",
  meta: { title: "Test Map", minPlayers: 2, maxPlayers: 2, specialRules: false, imageUrl: "/test.png" },
  zones: [],
  spaces: [
    { id: "s1", x: 0.2, y: 0.5, zones: [], adjacentTo: ["s2"] },
    { id: "s2", x: 0.5, y: 0.5, zones: [], adjacentTo: ["s1", "s3"] },
    { id: "s3", x: 0.8, y: 0.5, zones: [], adjacentTo: ["s2"] },
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
  size: "NORMAL",
  defeated: false,
  ...over,
});

describe("ProBoard two-space fighter identity label", () => {
  it("draws a label with the fighter's (leading-'The'-stripped) name between its two segments", () => {
    render(
      <ChakraProvider>
        <ProBoard
          map={MAP}
          fighters={[fighter({ id: "p1/kong", name: "King Kong", space: "s1", tailSpace: "s2" })]}
        />
      </ChakraProvider>
    );
    expect(screen.getByText("King Kong")).toBeInTheDocument();
  });

  it("strips a leading 'The' the same way the token initials do", () => {
    render(
      <ChakraProvider>
        <ProBoard map={MAP} fighters={[fighter({ space: "s1", tailSpace: "s2" })]} />
      </ChakraProvider>
    );
    expect(screen.getByText("Mandalorian")).toBeInTheDocument();
    expect(screen.queryByText("The Mandalorian")).not.toBeInTheDocument();
  });

  it("draws nothing extra for a NORMAL (single-space) fighter", () => {
    const { container } = render(
      <ChakraProvider>
        <ProBoard map={MAP} fighters={[fighter({ space: "s1" })]} />
      </ChakraProvider>
    );
    // No band, and no label text floating on the board.
    expect(container.querySelectorAll("line")).toHaveLength(0);
    expect(screen.queryByText("Mandalorian")).not.toBeInTheDocument();
  });

  it("draws one label per two-space fighter, not one per segment", () => {
    render(
      <ChakraProvider>
        <ProBoard map={MAP} fighters={[fighter({ space: "s1", tailSpace: "s2" })]} />
      </ChakraProvider>
    );
    expect(screen.getAllByText("Mandalorian")).toHaveLength(1);
  });
});

describe("ProBoard two-space fighter highlight parity (head vs tail)", () => {
  const large = fighter({ space: "s1", tailSpace: "s2" });

  it("pulses BOTH segments identically when the fighter is a legal target", () => {
    render(
      <ChakraProvider>
        <ProBoard
          map={MAP}
          fighters={[large]}
          highlightedFighters={["p1/hero"]}
          onFighterClick={() => {}}
        />
      </ChakraProvider>
    );
    const [head, tail] = screen.getAllByTitle(/The Mandalorian/);
    const headAnim = getComputedStyle(head).animation;
    const tailAnim = getComputedStyle(tail).animation;
    expect(headAnim).toBeTruthy();
    // Same keyframes, same timing — a player must not be able to tell the two
    // segments apart by how urgently each one is pulsing.
    expect(tailAnim).toBe(headAnim);
  });

  it("gives BOTH segments the same selection ring when the fighter is selected", () => {
    const { container } = render(
      <ChakraProvider>
        <ProBoard map={MAP} fighters={[large]} selectedFighter="p1/hero" />
      </ChakraProvider>
    );
    const [head, tail] = screen.getAllByTitle(/The Mandalorian/);
    expect(getComputedStyle(head).boxShadow).toContain("#fff");
    expect(getComputedStyle(tail).boxShadow).toBe(getComputedStyle(head).boxShadow);
    void container;
  });

  it("does not pulse either segment when the fighter is not currently offered", () => {
    render(
      <ChakraProvider>
        <ProBoard map={MAP} fighters={[large]} highlightedFighters={[]} />
      </ChakraProvider>
    );
    const [head, tail] = screen.getAllByTitle(/The Mandalorian/);
    expect(getComputedStyle(head).animation).toBeFalsy();
    expect(getComputedStyle(tail).animation).toBeFalsy();
  });

  it("routes a click on the TAIL segment to onFighterClick with the fighter's base id", () => {
    const onFighterClick = jest.fn();
    render(
      <ChakraProvider>
        <ProBoard
          map={MAP}
          fighters={[large]}
          highlightedFighters={["p1/hero"]}
          onFighterClick={onFighterClick}
        />
      </ChakraProvider>
    );
    const [, tail] = screen.getAllByTitle(/The Mandalorian/);
    fireEvent.click(tail);
    expect(onFighterClick).toHaveBeenCalledWith("p1/hero");
  });
});
