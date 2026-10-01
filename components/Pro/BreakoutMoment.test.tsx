import { fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { BreakoutMomentOverlay } from "./BreakoutMoment";
import type { BreakoutMoment } from "@/lib/pro/breakoutMoment";

const moment: BreakoutMoment = {
  enclosure: 3,
  space: "s3",
  marker: "dilophosaurus",
  enemy: { name: "Raptor", hp: 5, maxHp: 5, size: "NORMAL", move: 4, joinsDeck: true },
  lost: 1,
  total: 4,
  pushedBy: null,
};
const ui = (compact: boolean, onDone = jest.fn()) =>
  render(
    <ChakraProvider>
      <BreakoutMomentOverlay moment={moment} compact={compact} onDone={onDone} />
    </ChakraProvider>
  );

describe("BreakoutMomentOverlay", () => {
  it("renders the interstitial and skips on click", () => {
    const onDone = jest.fn();
    ui(false, onDone);
    expect(screen.getByText("ENCLOSURE 03 DESTROYED")).toBeTruthy();
    expect(screen.getByText("1 of 4")).toBeTruthy();
    expect(screen.queryByText("WHAT PUSHED IT OVER")).toBeNull();
    fireEvent.click(screen.getByTestId("breakout-moment"));
    expect(onDone).toHaveBeenCalled();
  });
  it("shows a toast, not a dialog, when a prompt is open", () => {
    ui(true);
    expect(screen.getByTestId("breakout-toast")).toBeTruthy();
    expect(screen.queryByTestId("breakout-moment")).toBeNull();
  });
});
