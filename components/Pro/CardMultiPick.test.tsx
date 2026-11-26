import { fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { CardMultiPick, multiPickInstruction } from "./CardMultiPick";

const HAND = ["a/x#1", "a/y#2", "a/z#3"];

const mount = (over: Partial<Parameters<typeof CardMultiPick>[0]> = {}) => {
  const onConfirm = jest.fn();
  render(
    <ChakraProvider>
      <CardMultiPick
        cards={HAND}
        max={2}
        counts={[0, 1, 2]}
        resolveCard={() => null}
        labelFor={(c) => `label ${c}`}
        onConfirm={onConfirm}
        {...over}
      />
    </ChakraProvider>
  );
  return onConfirm;
};

const card = (c: string) => screen.getByRole("button", { name: `label ${c}` });
const pressed = () => HAND.filter((c) => card(c).getAttribute("aria-pressed") === "true");

describe("CardMultiPick", () => {
  it("shows every card of the hand and starts on 'Return none'", () => {
    const onConfirm = mount();
    HAND.forEach((c) => expect(card(c)).toBeTruthy());
    expect(pressed()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Return none" }));
    expect(onConfirm).toHaveBeenCalledWith([]);
  });

  it("toggles on tap and names the count on the confirm button", () => {
    const onConfirm = mount();
    fireEvent.click(card("a/y#2"));
    expect(screen.getByRole("button", { name: "Return 1 card" })).toBeTruthy();
    fireEvent.click(card("a/x#1"));
    expect(screen.getByText(/2 \/ 2 selected/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Return 2 cards" }));
    expect(onConfirm).toHaveBeenCalledWith(["a/y#2", "a/x#1"]);
  });

  it("deselects on a second tap", () => {
    mount();
    fireEvent.click(card("a/y#2"));
    fireEvent.click(card("a/y#2"));
    expect(pressed()).toEqual([]);
    expect(screen.getByRole("button", { name: "Return none" })).toBeTruthy();
  });

  it("never selects a card past the max", () => {
    mount();
    HAND.forEach((c) => fireEvent.click(card(c)));
    expect(pressed()).toEqual(["a/x#1", "a/y#2"]);
    expect(card("a/z#3").getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByRole("button", { name: "Return 2 cards" })).toBeTruthy();
    // freeing a slot makes the third card pickable again
    fireEvent.click(card("a/x#1"));
    fireEvent.click(card("a/z#3"));
    expect(pressed()).toEqual(["a/y#2", "a/z#3"]);
  });

  it("caps a one-card hand at 1", () => {
    mount({ cards: ["a/x#1"], max: 1, counts: [0, 1] });
    expect(screen.getByTestId("card-multi-pick-count").textContent).toBe("0 / 1 selected");
    fireEvent.click(card("a/x#1"));
    expect(screen.getByRole("button", { name: "Return 1 card" })).toBeTruthy();
  });

  // Issue #1703: the instruction is the prompt's heading (the page puts it where the
  // engine's "how many?" stood), so the picker itself carries only the running count.
  it("states no instruction of its own, only the count beside the button", () => {
    mount();
    expect(screen.queryByText(/up to 2 cards/i)).toBeNull();
    expect(screen.getByTestId("card-multi-pick-count").textContent).toBe("0 / 2 selected");
  });

  it("words the heading for the page: how many, whose hand, singular for one", () => {
    expect(multiPickInstruction(2, "the opponent's")).toBe(
      "Click up to 2 cards from the opponent's hand to return to their deck"
    );
    expect(multiPickInstruction(1, "P3's")).toBe("Click up to 1 card from P3's hand to return to their deck");
  });

  // Issue #1703: the dock / sheet may be scrolled when the prompt arrives.
  it("scrolls itself into view when it opens, and only then", () => {
    const scrollIntoView = jest.fn();
    const proto = window.HTMLElement.prototype as { scrollIntoView?: unknown };
    const before = proto.scrollIntoView;
    proto.scrollIntoView = scrollIntoView;
    try {
      mount();
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView.mock.instances[0]).toBe(screen.getByTestId("card-multi-pick"));
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
      fireEvent.click(card("a/y#2"));
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
    } finally {
      proto.scrollIntoView = before;
    }
  });

  it("disables confirm on a count the prompt does not offer", () => {
    const onConfirm = mount({ counts: [1, 2] });
    const none = screen.getByRole("button", { name: "Return none" });
    expect(none).toHaveProperty("disabled", true);
    fireEvent.click(none);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
