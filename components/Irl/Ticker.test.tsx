/**
 * The IRL digit ticker (#810): whatever it animates, it must always read as
 * the latest value — the counters, the pile tiles and (#811) the card view's
 * Total all put their number through it.
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { Ticker } from "./irl.ui";

describe("Ticker", () => {
  it("renders its value", () => {
    render(<Ticker value={7} />);
    expect(screen.getByTestId("irl-ticker")).toHaveTextContent("7");
  });

  it("renders the new value after a change, in either direction", () => {
    const { rerender } = render(<Ticker value={7} />);
    rerender(<Ticker value={6} />);
    // the outgoing 7 may still be sliding out, hidden from assistive tech
    expect(screen.getByText("6")).not.toHaveAttribute("aria-hidden");
    rerender(<Ticker value={9} />);
    expect(screen.getByText("9")).not.toHaveAttribute("aria-hidden");
  });
});
