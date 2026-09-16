import { act, fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { CardPreviewProvider } from "./CardPreview";
import { CardFace } from "./ProHand";
import { DeckImportCardType } from "@/components/DeckPool/deck-import.type";

// the real card measures its text on a canvas, which jsdom hasn't got
jest.mock("../CardFactory/Card", () => ({
  Card: ({ card }: { card: { title: string } }) => <div data-testid="card-render">{card.title}</div>,
}));

const card = { title: "Feint" } as DeckImportCardType;

const renderPickerCard = (onPick: () => void) =>
  render(
    <ChakraProvider>
      <CardPreviewProvider>
        <button type="button" onClick={onPick}>
          <CardFace card={card} fallback="Feint" touchPeekOnly />
        </button>
      </CardPreviewProvider>
    </ChakraProvider>
  );

describe("touch-only card peek (mobile card picker)", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("reads the card large while held, and the release does not pick it", () => {
    const onPick = jest.fn();
    renderPickerCard(onPick);
    const face = screen.getByTestId("card-render");

    fireEvent.touchStart(face);
    act(() => jest.advanceTimersByTime(300));
    expect(screen.getAllByTestId("card-render")).toHaveLength(2);

    const release = fireEvent.touchEnd(face);
    expect(release).toBe(false); // default prevented: no trailing click
    expect(screen.getAllByTestId("card-render")).toHaveLength(1);
    expect(onPick).not.toHaveBeenCalled();
  });

  it("never previews on focus, so tapping the picker button stays quiet", () => {
    renderPickerCard(jest.fn());

    fireEvent.focus(screen.getByRole("button"));
    fireEvent.focus(screen.getByTestId("card-render").parentElement as HTMLElement);

    expect(screen.getAllByTestId("card-render")).toHaveLength(1);
  });

  it("lets a quick tap through to the button", () => {
    const onPick = jest.fn();
    renderPickerCard(onPick);
    const face = screen.getByTestId("card-render");

    fireEvent.touchStart(face);
    act(() => jest.advanceTimersByTime(100));
    expect(fireEvent.touchEnd(face)).toBe(true);
    fireEvent.click(face);

    expect(onPick).toHaveBeenCalledTimes(1);
  });
});
