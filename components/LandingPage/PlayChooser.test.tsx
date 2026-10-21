/**
 * The hero's "Play now" chooser (unbrewed-p2p-1353): in the DOM while closed
 * (crawlable), opens to four options with the solo one first, moves focus in,
 * and Escape closes it and hands focus back to the button.
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { PlayChooser } from "./PlayChooser";

const renderChooser = () =>
  render(
    <ChakraProvider>
      <PlayChooser />
    </ChakraProvider>,
  );

describe("PlayChooser", () => {
  it("renders its links in the DOM while closed, hidden", () => {
    const { container } = renderChooser();
    const button = screen.getByRole("button", { name: "Play now" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    const panel = container.querySelector(`#${CSS.escape(button.getAttribute("aria-controls")!)}`);
    expect(panel).toHaveAttribute("hidden");
    expect(panel!.querySelectorAll("a")).toHaveLength(4);
  });

  it("opens with the solo bot option first and focuses it", () => {
    renderChooser();
    fireEvent.click(screen.getByRole("button", { name: "Play now" }));
    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/pro/game?vs=ai-medium",
      "/connect",
      "/table",
      "/irl",
    ]);
    expect(links[0]).toHaveFocus();
    expect(screen.getByRole("button", { name: "Play now" })).toHaveAttribute("aria-expanded", "true");
  });

  it("closes on Escape and returns focus to the button", () => {
    renderChooser();
    const button = screen.getByRole("button", { name: "Play now" });
    fireEvent.click(button);
    expect(screen.getByRole("region", { name: "Choose how to play" })).toBeVisible();

    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveFocus();
    expect(screen.queryByRole("region", { name: "Choose how to play" })).toBeNull();
  });

  it("closes on a click outside", () => {
    renderChooser();
    fireEvent.click(screen.getByRole("button", { name: "Play now" }));
    fireEvent.pointerDown(document.body);
    expect(screen.getByRole("button", { name: "Play now" })).toHaveAttribute("aria-expanded", "false");
  });
});
