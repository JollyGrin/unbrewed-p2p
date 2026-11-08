/**
 * The map modal's "deck map" entry follows the active hotseat seat's deck
 * (issue #1563); without hotseat (online, no provider) it is the starred deck.
 */
import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { render } from "@testing-library/react";
import { WebGameContext } from "../../../lib/contexts/WebGameProvider";
import { MapModal } from "./map.modal";

jest.mock("next/router", () => ({
  useRouter: () => ({ query: {}, push: jest.fn() }),
}));
jest.mock("react-focus-lock", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockEntry = jest.fn();
jest.mock("./deckMap.entry", () => ({
  DeckMapEntry: (props: { deck?: { id: string } }) => {
    mockEntry(props.deck?.id);
    return null;
  },
}));
jest.mock("../../../lib/bag/useBag", () => ({
  ...jest.requireActual("../../../lib/bag/useBag"),
  useBagDecks: () => ({ starredDeck: { id: "starred" } }),
}));

Element.prototype.scrollIntoView = jest.fn();

const shownDeck = (ctx?: Record<string, unknown>) => {
  mockEntry.mockClear();
  render(
    <ChakraProvider>
      <WebGameContext.Provider value={ctx as never}>
        <MapModal isOpen onClose={() => {}} />
      </WebGameContext.Provider>
    </ChakraProvider>,
  );
  return mockEntry.mock.calls.at(-1)?.[0];
};

const hotseat = (active: string) => ({
  seats: ["offline", "opponent"],
  active,
  setActive: jest.fn(),
  addSeat: jest.fn(),
  removeSeat: jest.fn(),
});
const deckFor = (name: string) =>
  name === "opponent" ? { id: "opp-deck" } : { id: "first-deck" };

it("uses the starred deck outside a provider", () => {
  expect(shownDeck(undefined)).toBe("starred");
});

it("uses the starred deck when the provider has no hotseat", () => {
  expect(shownDeck({})).toBe("starred");
});

it("uses the active seat's deck under hotseat", () => {
  expect(shownDeck({ hotseat: hotseat("opponent"), deckFor })).toBe("opp-deck");
  expect(shownDeck({ hotseat: hotseat("offline"), deckFor })).toBe("first-deck");
});

it("falls back to the starred deck when the seat has no deck", () => {
  expect(shownDeck({ hotseat: hotseat("opponent"), deckFor: () => undefined })).toBe(
    "starred",
  );
});
