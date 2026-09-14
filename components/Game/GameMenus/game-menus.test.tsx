/**
 * The deck switcher's /bag links (issue #821). A networked game hides them —
 * navigating away mid-game drops the player out of their lobby (#493) — while
 * IRL Mode, solo and saved on-device, opts in so a new deck is one tap away.
 */
import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { fireEvent, render, screen } from "@testing-library/react";
import { GameMenusProvider, useGameMenus } from "./game-menus";

jest.mock("next/router", () => ({
  useRouter: () => ({ query: { name: "me" }, push: jest.fn() }),
}));

// Chakra's modal focus trap trips jsdom's nwsapi; the trap isn't under test.
jest.mock("react-focus-lock", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockDeck = {
  id: "d1",
  name: "Alice",
  deck_data: {
    hero: { name: "Alice" },
    appearance: { highlightColour: "#fff", borderColour: "#000" },
  },
};

jest.mock("../../../lib/bag/useBag", () => ({
  useBagDecks: () => ({
    decks: [mockDeck],
    starredDeck: mockDeck,
    setStar: jest.fn(),
  }),
}));

jest.mock("../../../lib/contexts/WebGameProvider", () => ({
  useWebGame: () => ({
    gameState: undefined,
    resetStatus: { pending: false },
    switchDeck: jest.fn(),
  }),
}));

const Opener = () => {
  const menus = useGameMenus();
  return <button onClick={menus?.openChangeDeck}>open change deck</button>;
};

const openChangeDeck = async (linkToBag?: boolean) => {
  render(
    <ChakraProvider>
      <GameMenusProvider linkToBag={linkToBag}>
        <Opener />
      </GameMenusProvider>
    </ChakraProvider>,
  );
  fireEvent.click(screen.getByText("open change deck"));
  await screen.findByText("Change my deck");
};

const bagLinks = () => document.querySelectorAll('a[href="/bag"]');

it("hides every /bag link by default, as in a networked game", async () => {
  await openChangeDeck();
  expect(screen.queryByText(/add more decks in your bag/i)).toBeNull();
  expect(bagLinks()).toHaveLength(0);
});

it("offers the add-decks link when the provider opts in, as IRL Mode does", async () => {
  await openChangeDeck(true);
  expect(
    screen.getByText(/add more decks in your bag/i).closest("a"),
  ).toHaveAttribute("href", "/bag");
});
