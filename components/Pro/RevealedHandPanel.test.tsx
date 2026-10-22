import { fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { RevealedHandPanel } from "./RevealedHandPanel";

const revealed = { revealer: "p1" as const, owner: "p2" as const, cards: ["a/x#1", "a/y#2"], turn: 3 };

const mount = () =>
  render(
    <ChakraProvider>
      <RevealedHandPanel revealed={revealed} heroName="King Kong" resolveCard={() => null} labelFor={(c) => `label ${c}`} />
    </ChakraProvider>
  );

describe("RevealedHandPanel", () => {
  it("shows the snapshot's cards under a turn-stamped heading, and only those", () => {
    mount();
    expect(screen.getByText("Revealed: King Kong's hand")).toBeTruthy();
    expect(screen.getByText("as of turn 3")).toBeTruthy();
    expect(screen.getAllByText(/^label /)).toHaveLength(2);
  });

  it("collapses to just the heading", () => {
    mount();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.queryAllByText(/^label /)).toHaveLength(0);
    expect(screen.getByText("Revealed: King Kong's hand")).toBeTruthy();
  });
});
