import { fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { RevealedHandPanel } from "./RevealedHandPanel";

const revealed = { revealer: "p1" as const, owner: "p2" as const, cards: ["a/x#1", "a/y#2"], turn: 3 };

const mount = (top?: number, inline = false) =>
  render(
    <ChakraProvider>
      <RevealedHandPanel revealed={revealed} heroName="King Kong" resolveCard={() => null} labelFor={(c) => `label ${c}`} top={top} inline={inline} />
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

  it("starts at the measured HUD bottom when the page passes one", () => {
    mount(267);
    expect(getComputedStyle(screen.getByTestId("revealed-hand-panel")).top).toBe("267px");
  });

  it("inline (a format's own chrome strip, p2p #1456) flows in place: not fixed, `top` ignored", () => {
    mount(267, true);
    const panel = screen.getByTestId("revealed-hand-panel");
    expect(getComputedStyle(panel).position).toBe("relative");
    expect(getComputedStyle(panel).top).not.toBe("267px");
    expect(panel.getAttribute("data-inline")).toBe("true");
    expect(screen.getAllByText(/^label /)).toHaveLength(2);
  });
});
