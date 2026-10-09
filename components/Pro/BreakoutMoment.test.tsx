import { fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { BreakoutMomentOverlay } from "./BreakoutMoment";
import type { BreakoutMoment } from "@/lib/pro/breakoutMoment";

const moment: BreakoutMoment = {
  objectNumber: 3,
  space: "s3",
  marker: "dilophosaurus",
  enemy: { name: "Raptor", hp: 5, maxHp: 5, size: "NORMAL", move: 4, joinsDeck: true },
  lost: 1,
  total: 4,
  pushedBy: null,
  display: null,
};
const PENS = { objectNoun: { singular: "pen", plural: "pens" } } as unknown as NonNullable<BreakoutMoment["display"]>;
const ui = (compact: boolean, onDone = jest.fn(), m: BreakoutMoment = moment) =>
  render(
    <ChakraProvider>
      <BreakoutMomentOverlay moment={m} compact={compact} onDone={onDone} />
    </ChakraProvider>
  );

describe("BreakoutMomentOverlay", () => {
  it("renders the interstitial and skips on click", () => {
    const onDone = jest.fn();
    ui(false, onDone);
    expect(screen.getByText("SPACE 03 DESTROYED")).toBeTruthy();
    expect(screen.getByText("SPACES LOST")).toBeTruthy();
    expect(screen.getByText("1 of 4")).toBeTruthy();
    expect(screen.queryByText("WHAT PUSHED IT OVER")).toBeNull();
    fireEvent.click(screen.getByTestId("breakout-moment"));
    expect(onDone).toHaveBeenCalled();
  });
  it("names the scenario's objects from display.objectNoun (#807)", () => {
    ui(false, jest.fn(), { ...moment, display: PENS });
    expect(screen.getByText("PEN 03 DESTROYED")).toBeTruthy();
    expect(screen.getByText("PENS LOST")).toBeTruthy();
  });
  it("shows a toast, not a dialog, when a prompt is open", () => {
    ui(true);
    expect(screen.getByTestId("breakout-toast")).toBeTruthy();
    expect(screen.queryByTestId("breakout-moment")).toBeNull();
  });
});
