import { fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { TableHudDock, TableHudDockProps } from "./TableHudDock";

const dock = (over: Partial<TableHudDockProps> = {}) => {
  const onControl = jest.fn();
  const utils = render(
    <ChakraProvider>
      <TableHudDock
        banner={{ title: "Your turn", detail: null, pips: 2, tone: "mine" }}
        controls={{
          main: { id: "primary", label: "Maneuver", emphasis: "gold", disabled: false },
          minor: [{ id: "undo", label: "Undo", emphasis: "plain", disabled: false }],
        }}
        primaryTitle="Maneuver: draw a card, then move up to 3"
        sheet={null}
        onControl={onControl}
        {...over}
      />
    </ChakraProvider>
  );
  return { ...utils, onControl };
};

describe("TableHudDock", () => {
  test("hangs the turn line between the plates, with one dot per action left", () => {
    const { container } = dock();
    expect(screen.getByText("Your turn")).toBeTruthy();
    expect(container.querySelectorAll("[data-hud-pip]")).toHaveLength(2);
  });

  test("the big hexagon fires the turn's action", () => {
    const { onControl } = dock();
    const hex = screen.getByRole("button", { name: "Maneuver" });
    expect(hex.getAttribute("title")).toBe("Maneuver: draw a card, then move up to 3");
    fireEvent.click(hex);
    expect(onControl).toHaveBeenCalledWith("primary");
  });

  test("the small hexagons fire their own controls", () => {
    const { onControl } = dock();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onControl).toHaveBeenCalledWith("undo");
  });

  test("a disabled hexagon does nothing", () => {
    const { onControl } = dock({
      controls: { main: { id: "end-move", label: "End move", emphasis: "outline", disabled: true }, minor: [] },
    });
    fireEvent.click(screen.getByRole("button", { name: "End move" }));
    expect(onControl).not.toHaveBeenCalled();
  });

  test("the decision sheet stands along the right edge while a decision needs it", () => {
    dock({ sheet: <p>Choose a card to discard</p>, controls: { main: null, minor: [] } });
    const sheet = screen.getByTestId("table-hud-sheet");
    expect(sheet.textContent).toContain("Choose a card to discard");
  });

  test("no banner outside a live game", () => {
    const { container } = dock({ banner: null });
    expect(container.querySelector("[data-table-hud-banner]")).toBeNull();
  });
});
