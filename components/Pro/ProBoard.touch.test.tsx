/**
 * Mobile step 1: actionable board circles are marked as picks, which is what the
 * auto-focus measures and what receives the enlarged touch hit area.
 */
import "@testing-library/jest-dom";
import { fireEvent, render } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { ProBoard } from "./ProBoard";
import { ProMapDef, ViewFighter } from "@/lib/pro/protocol";

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
});
