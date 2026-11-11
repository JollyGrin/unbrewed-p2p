/**
 * #1609: "Change my deck" (and the hotseat opponent picker) never offers a
 * malformed bag deck: switching to one threw in `newPool` after the star had
 * already moved.
 */
import { render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { ChangeDeckModal } from "./change-deck.modal";

// Chakra's focus trap uses a selector jsdom's nwsapi rejects (see
// MapPreviewModal.test.tsx); the trap is not what this tests.
jest.mock("react-focus-lock", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const deck = (id: string, name: string) =>
  ({ id, name, deck_data: { hero: { name }, cards: [], appearance: {} } }) as any;
const alpha = deck("alpha", "Alpha");
const bravo = deck("bravo", "Bravo");
const broken = { id: "broken", deck_data: {} } as any;
const bag = { decks: [broken, alpha, bravo], starredDeck: alpha, setStar: jest.fn() };
jest.mock("../../../lib/bag/useBag", () => ({ useBagDecks: () => bag }));
const game = { switchDeck: jest.fn(), deckFor: () => alpha };
jest.mock("../../../lib/contexts/WebGameProvider", () => ({ useWebGame: () => game }));
jest.mock("../../../lib/hotseat/useHotseat", () => ({
  SOLO_SEAT: "solo",
  heroOf: (d: { name: string }) => d.name,
  useHotseat: () => ({ addSeat: jest.fn() }),
}));
jest.mock("../../../lib/analytics", () => ({ track: jest.fn() }));

const options = () =>
  [...(screen.getByLabelText("Choose your deck") as HTMLSelectElement).options].map((o) => o.value);

it.each([
  ["self", ["alpha", "bravo"]],
  ["opponent", ["bravo"]],
] as const)("%s mode leaves the malformed deck out", (mode, expected) => {
  render(
    <ChakraProvider>
      <ChangeDeckModal isOpen onClose={jest.fn()} mode={mode} />
    </ChakraProvider>,
  );
  expect(options()).toEqual(expected);
});
