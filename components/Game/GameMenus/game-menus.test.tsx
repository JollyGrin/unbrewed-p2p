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

// Mutable so a case can play the online provider (no hotseat/deckFor) or the
// offline hotseat one; reset to the online shape before each case.
let mockGame: Record<string, unknown> = {};
const onlineGame = () => ({
  gameState: undefined,
  resetStatus: { pending: false },
  switchDeck: jest.fn(),
});
beforeEach(() => {
  mockGame = onlineGame();
});

jest.mock("../../../lib/contexts/WebGameProvider", () => ({
  useWebGame: () => mockGame,
}));

const Opener = () => {
  const menus = useGameMenus();
  return (
    <>
      <button onClick={menus?.openChangeDeck}>open change deck</button>
      <button onClick={menus?.openNewGame}>open new game</button>
    </>
  );
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

// ---- Hotseat (issue #1563) ----

const seatDeck = {
  id: "d2",
  name: "Bob",
  deck_data: {
    hero: { name: "Bob the Hero" },
    appearance: { highlightColour: "#fff", borderColour: "#000" },
  },
};

// Two pools, as hotseat has once an opponent is seated: online, the other pool
// would make the proposer wait on a vote.
const twoPools = {
  content: { players: { me: { pool: {} }, opponent: { pool: {} } } },
};

const openNewGame = async () => {
  render(
    <ChakraProvider>
      <GameMenusProvider>
        <Opener />
      </GameMenusProvider>
    </ChakraProvider>,
  );
  fireEvent.click(screen.getByText("open new game"));
  await screen.findByText("Start a new game?");
};

describe("new game dialog", () => {
  it("asks for consent when another pool exists and there is no hotseat (online)", async () => {
    mockGame = { ...onlineGame(), gameState: twoPools };
    await openNewGame();
    expect(screen.getByText("Ask for a new game")).toBeInTheDocument();
    expect(screen.queryByText("Start a new game")).toBeNull();
  });

  it("is solo under hotseat with two pools: no vote UI", async () => {
    mockGame = {
      ...onlineGame(),
      gameState: twoPools,
      hotseat: {
        seats: ["me", "opponent"],
        active: "opponent",
        setActive: jest.fn(),
        addSeat: jest.fn(),
        removeSeat: jest.fn(),
      },
      deckFor: (name: string) => (name === "opponent" ? seatDeck : undefined),
    };
    await openNewGame();
    expect(screen.getByText("Start a new game")).toBeInTheDocument();
    expect(screen.queryByText("Ask for a new game")).toBeNull();
  });

  it("is solo with a single hotseat seat", async () => {
    mockGame = {
      ...onlineGame(),
      hotseat: {
        seats: ["me"],
        active: "me",
        setActive: jest.fn(),
        addSeat: jest.fn(),
        removeSeat: jest.fn(),
      },
    };
    await openNewGame();
    expect(screen.getByText("Start a new game")).toBeInTheDocument();
  });

  it("names the starred deck when the context has no hotseat (online path)", async () => {
    await openNewGame();
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("names the active seat's deck under hotseat", async () => {
    mockGame = {
      ...onlineGame(),
      hotseat: {
        seats: ["me", "opponent"],
        active: "opponent",
        setActive: jest.fn(),
        addSeat: jest.fn(),
        removeSeat: jest.fn(),
      },
      deckFor: (name: string) => (name === "opponent" ? seatDeck : undefined),
    };
    await openNewGame();
    expect(screen.getByText("Bob the Hero")).toBeInTheDocument();
    expect(screen.queryByText("Alice")).toBeNull();
  });
});
