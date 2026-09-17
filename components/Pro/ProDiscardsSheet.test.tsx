import "@testing-library/jest-dom";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { DiscardSeat, ProDiscardsSheet } from "./ProDiscardsSheet";
import { CardInstanceId } from "@/lib/pro/protocol";
import { DeckImportCardType } from "@/components/DeckPool/deck-import.type";

// the real card measures its text on a canvas, which jsdom hasn't got
jest.mock("../CardFactory/Card", () => ({
  Card: ({ card }: { card: { title: string } }) => <div>{card.title}</div>,
}));

const TITLES: Record<string, string> = { c1: "Clobber", c2: "Regroup", c3: "Feint" };
const resolveCard = (id: CardInstanceId) => ({ title: TITLES[id] }) as DeckImportCardType;
const labelFor = (id: CardInstanceId) => TITLES[id] ?? id;

const seats: DiscardSeat[] = [
  { id: "p1", name: "King Kong", discard: ["c1", "c2"], you: true },
  { id: "p2", name: "Darth Vader", discard: [], you: false },
];

const renderSheet = (onClose = jest.fn()) => {
  render(
    <ChakraProvider>
      <ProDiscardsSheet isOpen onClose={onClose} seats={seats} resolveCard={resolveCard} labelFor={labelFor} />
    </ChakraProvider>
  );
  return onClose;
};

describe("discard piles sheet", () => {
  it("lists every seat's played cards, newest first", () => {
    renderSheet();
    const sheet = screen.getByTestId("pro-discards");

    expect(sheet).toHaveTextContent("King Kong (you) · 2");
    const cards = within(sheet).getAllByText(/Clobber|Regroup/);
    expect(cards.map((c) => c.textContent)).toEqual(["Regroup", "Clobber"]);
  });

  it("says so when a seat has played nothing yet", () => {
    renderSheet();

    expect(screen.getByTestId("pro-discards")).toHaveTextContent("nothing played yet");
  });

  it("closes from its header", () => {
    const onClose = renderSheet();

    fireEvent.click(screen.getByLabelText("Close discard piles"));

    expect(onClose).toHaveBeenCalled();
  });
});
