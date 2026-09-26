import { fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { TableHudHand } from "./TableHudHand";

jest.mock("../../ProHand", () => ({
  CardFace: ({ fallback }: { fallback: string }) => <span>{fallback}</span>,
  ProHand: ({ hand }: { hand: string[] }) => <div data-testid="drawer-hand">{hand.join(",")}</div>,
}));

const hand = (over: Partial<Parameters<typeof TableHudHand>[0]> = {}) => {
  const onOpen = jest.fn();
  const utils = render(
    <ChakraProvider>
      <TableHudHand
        hand={["c1", "c2", "c3", "c4", "c5"]}
        resolveCard={() => null as never}
        labelFor={(c) => `card ${c}`}
        actionsFor={() => []}
        onAction={() => {}}
        deckCount={20}
        discardCount={1}
        isOpen={false}
        onOpen={onOpen}
        onClose={() => {}}
        {...over}
      />
    </ChakraProvider>
  );
  return { ...utils, onOpen };
};

describe("TableHudHand", () => {
  test("fans every card of the hand face-up", () => {
    const { container } = hand();
    expect(container.querySelectorAll("[data-hud-fan-card]")).toHaveLength(5);
    expect(screen.getByText("card c3")).toBeTruthy();
  });

  test("the fan is one tap target that opens the drawer", () => {
    const { onOpen } = hand();
    fireEvent.click(screen.getByRole("button", { name: "Your hand — 5 cards" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  test("open, it is the drawer with the whole hand and its play buttons", () => {
    const { container } = hand({ isOpen: true });
    expect(container.querySelector("[data-table-hud-hand]")).toBeNull();
    expect(screen.getByTestId("hand-drawer")).toBeTruthy();
  });

  test("moves out from under the decision sheet", () => {
    const { container } = hand({ besideSheet: true });
    const fan = container.querySelector("[data-table-hud-hand]") as HTMLElement;
    expect(getComputedStyle(fan).left).toContain("calc(50% - 115px)");
  });

  test("tilts the outer cards away from the centre", () => {
    const { container } = hand();
    const cards = [...container.querySelectorAll<HTMLElement>("[data-hud-fan-card]")];
    expect(cards[0].style.transform).toContain("rotate(-10deg)");
    expect(cards[4].style.transform).toContain("rotate(10deg)");
  });
});
