import { fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { TableHudPlate, TableHudPlateProps } from "./TableHudPlate";

const plate = (over: Partial<TableHudPlateProps> = {}) => {
  const onOpen = jest.fn();
  const utils = render(
    <ChakraProvider>
      <TableHudPlate
        seat="p1"
        name="King Kong"
        heroHp={32}
        sidekickHps={[]}
        portraitUrl="/token/kong.png"
        seatColor="#E0A82E"
        piles={{ deck: 24, discard: 0, hand: 5 }}
        local
        active={false}
        offline={false}
        side="left"
        timer={null}
        onOpen={onOpen}
        {...over}
      />
    </ChakraProvider>
  );
  return { ...utils, onOpen };
};

describe("TableHudPlate", () => {
  test("shows the hero, its health and the three piles a player tracks", () => {
    plate();
    expect(screen.getByText("King Kong")).toBeTruthy();
    expect(screen.getByText("32")).toBeTruthy();
    expect(screen.getByText("Deck 24 · Discard 0 · Hand 5")).toBeTruthy();
  });

  test("rings the portrait in the seat's colour, so it matches the figure's base", () => {
    const { container } = plate({ seatColor: "#3B8BEB" });
    const portrait = container.querySelector("[data-plate-portrait]") as HTMLElement;
    expect(portrait.getAttribute("data-seat-color")).toBe("#3B8BEB");
  });

  test("falls back to initials when the hero has no token art", () => {
    const { container } = plate({ portraitUrl: null });
    expect(container.querySelector("[data-plate-portrait] img")).toBeNull();
    expect(screen.getByText("KIN")).toBeTruthy();
  });

  test("mirrors for the opponent's corner: portrait on the outside edge", () => {
    const { container } = plate({ side: "right", local: false });
    const root = container.querySelector("[data-table-hud-plate]") as HTMLElement;
    expect(root.getAttribute("data-side")).toBe("right");
    expect(root.getAttribute("data-local")).toBeNull();
  });

  test("spells out up to two sidekicks and counts the rest", () => {
    plate({
      sidekickHps: [
        { id: "a", hp: 3, defeated: false },
        { id: "b", hp: 1, defeated: true },
        { id: "c", hp: 2, defeated: false },
      ],
    });
    expect(screen.getByText("+♥3")).toBeTruthy();
    expect(screen.getByText("+♥1")).toBeTruthy();
    expect(screen.getByText("+1")).toBeTruthy();
  });

  test("opens the seat details on tap", () => {
    const { onOpen } = plate();
    fireEvent.click(screen.getByRole("button", { name: /King Kong — open seat details/ }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  test("marks whose turn it is", () => {
    const { container } = plate({ active: true });
    expect(container.querySelector("[data-table-hud-plate]")?.getAttribute("data-active")).toBe("");
  });
});
