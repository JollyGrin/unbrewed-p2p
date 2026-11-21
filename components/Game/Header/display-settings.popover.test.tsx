import { fireEvent, render, screen } from "@testing-library/react";

import { SHARP_HAND_KEY, resetSharpHandUrlForTests } from "@/lib/hand/sharpHand";
import { DisplaySettings } from "./display-settings.popover";

// Chakra's popover focus-on-open trips jsdom's nwsapi (see hotseatUi.test).
jest.mock("@chakra-ui/react-use-focus-effect", () => ({
  useFocusOnHide: () => {},
  useFocusOnShow: () => {},
}));

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, "", "/offline");
  resetSharpHandUrlForTests();
});

describe("Display settings chip (#1712)", () => {
  it("has a Sharp hand cards switch, off by default, that saves on this device", () => {
    render(<DisplaySettings />);
    fireEvent.click(screen.getByRole("button", { name: "Display settings" }));
    const sw = screen.getByLabelText(/Sharp hand cards/) as HTMLInputElement;
    expect(sw.checked).toBe(false);
    expect(screen.getByText(/Try this if cards in your hand look blurry/)).toBeTruthy();

    fireEvent.click(sw);
    expect(sw.checked).toBe(true);
    expect(localStorage.getItem(SHARP_HAND_KEY)).toBe("1");

    fireEvent.click(sw);
    expect(sw.checked).toBe(false);
    expect(localStorage.getItem(SHARP_HAND_KEY)).toBeNull();
  });

  it("shows the switch on when a link turned it on", () => {
    window.history.replaceState({}, "", "/offline?sharpHand=1");
    resetSharpHandUrlForTests();
    render(<DisplaySettings />);
    fireEvent.click(screen.getByRole("button", { name: "Display settings" }));
    expect((screen.getByLabelText(/Sharp hand cards/) as HTMLInputElement).checked).toBe(true);
  });
});
