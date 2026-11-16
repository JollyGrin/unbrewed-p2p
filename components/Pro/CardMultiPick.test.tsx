import { fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { CardMultiPick } from "./CardMultiPick";

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
    expect(screen.getByText(/Tap up to 1 card to return/)).toBeTruthy();
    fireEvent.click(card("a/x#1"));
    expect(screen.getByRole("button", { name: "Return 1 card" })).toBeTruthy();
  });

  it("disables confirm on a count the prompt does not offer", () => {
    const onConfirm = mount({ counts: [1, 2] });
    const none = screen.getByRole("button", { name: "Return none" });
    expect(none).toHaveProperty("disabled", true);
    fireEvent.click(none);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
