import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ReactNode } from "react";

import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { initPool } from "@/lib/sandbox/initGame";
import { OfflineGameProvider } from "@/lib/contexts/OfflineGameProvider";
import { WebGameContext, useWebGame } from "@/lib/contexts/WebGameProvider";
import { HeaderContainer } from "@/components/Game/Header/header.container";
import { CommandMenu } from "@/components/Game/CommandMenu/command-menu";
import { GameMenusProvider, useGameMenus } from "@/components/Game/GameMenus/game-menus";
import { PassDeviceCover } from "@/components/Game/Hand/pass-device.cover";

/**
 * The hotseat UI on /offline (issue #1564): Add opponent → deck picker → a
 * second seat, Switch seat (header chip, ⌘ palette, "Play this side") moving
 * `?name=` and the provider's active seat together, the pass-the-device
 * cover, and Back to solo. Nothing of it renders without hotseat controls
 * (the online provider) or off /offline (/irl mounts the same provider).
 */

// A router whose shallow `replace` actually moves the query and re-renders.
let mockRoute = { pathname: "/offline", query: { name: "offline" } as Record<string, string> };
const mockListeners = new Set<() => void>();
const mockReplace = jest.fn((url: { query: Record<string, string> }) => {
  mockRoute = { ...mockRoute, query: url.query };
  mockListeners.forEach((l) => l());
  return Promise.resolve(true);
});
const mockRouter = () => ({ ...mockRoute, isReady: true, replace: mockReplace, push: jest.fn() });
jest.mock("next/router", () => ({
  useRouter: () =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    require("react").useSyncExternalStore(
      (l: () => void) => {
        mockListeners.add(l);
        return () => mockListeners.delete(l);
      },
      () => mockRoute,
    ) && mockRouter(),
}));

// Chakra's modal focus trap trips jsdom's nwsapi; the trap isn't under test.
jest.mock("react-focus-lock", () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const deck = (hero: string): DeckImportType =>
  ({
    id: `deck-${hero}`,
    family_id: `deck-${hero}`,
    name: `${hero} deck`,
    note: "",
    user: "test",
    deck_data: {
      name: `${hero} deck`,
      appearance: { highlightColour: "#fff", borderColour: "#000" },
      hero: { name: hero, hp: 15, move: 2, isRanged: false, specialAbility: "" },
      sidekick: { name: "", hp: null, isRanged: false, quantity: 0, quote: "" },
      cards: [{ title: `${hero} card`, quantity: 6, imageUrl: `https://img/${hero}.png` }],
    },
  }) as any;

const ALICE = deck("Alice");
const BOB = deck("Bob");

let mockBag: DeckImportType[] = [ALICE, BOB];
const mockSetStar = jest.fn();
jest.mock("../../lib/bag/useBag", () => ({
  ...jest.requireActual("../../lib/bag/useBag"),
  useBagDecks: () => ({ decks: mockBag, starredDeck: mockBag[0], setStar: mockSetStar }),
}));

jest.mock("../../lib/sandbox/initGame", () => ({
  ...jest.requireActual("../../lib/sandbox/initGame"),
  readStarredDeck: () => mockBag[0],
}));

type Game = ReturnType<typeof useWebGame>;
let game!: Game;

/** Seeds the first seat's pool the way HandContainer's auto-init would. */
const Probe = () => {
  game = useWebGame();
  return null;
};

const NewGameOpener = () => {
  const menus = useGameMenus();
  return <button onClick={menus?.openNewGame}>open new game</button>;
};

const table = (
  <>
    <Probe />
    <GameMenusProvider>
      <HeaderContainer openPositionModal={() => {}} />
      <CommandMenu openModal={() => {}} />
      <PassDeviceCover />
      <NewGameOpener />
    </GameMenusProvider>
  </>
);

const renderOffline = () => {
  render(
    <ChakraProvider>
      <OfflineGameProvider>{table}</OfflineGameProvider>
    </ChakraProvider>,
  );
  act(() => game.setPlayerState()({ pool: initPool(ALICE) }));
};

const openPalette = () =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
  });

const addOpponent = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Add opponent" }));
  await screen.findByText("Choose the opposing deck");
  fireEvent.click(screen.getAllByRole("button", { name: "Add opponent" }).at(-1)!);
  // The picker closes (Chakra animates it out).
  await waitFor(() => expect(screen.queryByText("Choose the opposing deck")).toBeNull());
};

beforeEach(() => {
  mockRoute = { pathname: "/offline", query: { name: "offline" } };
  mockBag = [ALICE, BOB];
  mockReplace.mockClear();
  mockSetStar.mockClear();
});

describe("without hotseat", () => {
  it("adds no chrome under the online provider's shape (no hotseat)", () => {
    const online = {
      gameState: {
        msgtype: "",
        error: "",
        content: { gid: "g", last_updated: "", players: { offline: { pool: initPool(ALICE) } } },
      },
      gamePositions: undefined,
      setPlayerState: () => () => {},
      setPlayerPosition: { current: () => {} },
      connectionStatus: "open",
      logAction: () => {},
      latestRoll: undefined,
      publishRoll: () => {},
      offerCardTransfer: () => {},
      claimTableCard: () => {},
      resetStatus: { epoch: 0 },
      requestGameReset: () => {},
      cancelGameReset: () => {},
      forceGameReset: () => {},
      respondGameReset: () => {},
      switchDeck: () => {},
    } as unknown as Game;
    render(
      <ChakraProvider>
        <WebGameContext.Provider value={online}>{table}</WebGameContext.Provider>
      </ChakraProvider>,
    );
    expect(screen.queryByRole("button", { name: "Add opponent" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Switch seat" })).toBeNull();
    openPalette();
    expect(screen.queryByText("Switch seat")).toBeNull();
  });

  it("adds no chrome on /irl, which mounts the same offline provider", () => {
    mockRoute = { pathname: "/irl", query: { name: "offline" } };
    renderOffline();
    expect(game.hotseat).toBeDefined();
    expect(screen.queryByRole("button", { name: "Add opponent" })).toBeNull();
  });
});

describe("hotseat on /offline", () => {
  it("starts solo with an Add opponent chip and nothing else new", () => {
    renderOffline();
    expect(screen.getByRole("button", { name: "Add opponent" })).toBeInTheDocument();
    expect(screen.queryByText("Play this side")).toBeNull();
    // The solo seat keeps its raw key, exactly as today.
    expect(screen.getByText("offline")).toBeInTheDocument();
    openPalette();
    expect(screen.queryByText("Switch seat")).toBeNull();
  });

  it("Add opponent seats the picked deck without touching the star; the chip flips to Switch seat", async () => {
    renderOffline();
    await addOpponent();
    expect(game.hotseat?.seats).toEqual(["offline", "opponent"]);
    expect(mockSetStar).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Switch seat" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add opponent" })).toBeNull();
    // Both boxes show their hero; the opponent's offers to play that side.
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.queryByText("opponent")).toBeNull();
    expect(screen.getByText("Play this side")).toBeInTheDocument();
  });

  it("offers only the rest of the bag, and an empty state with the /bag link when there is none", async () => {
    mockBag = [ALICE];
    renderOffline();
    fireEvent.click(screen.getByRole("button", { name: "Add opponent" }));
    await screen.findByText("Choose the opposing deck");
    expect(screen.getByText(/no other deck yet/i)).toBeInTheDocument();
    expect(document.querySelector('a[href="/bag"]')).not.toBeNull();
    expect(screen.getAllByRole("button", { name: "Add opponent" }).at(-1)).toBeDisabled();
  });

  it("Switch seat moves ?name= and the active seat together, then covers the hand until tapped", async () => {
    renderOffline();
    await addOpponent();
    expect(screen.queryByText(/tap to reveal/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Switch seat" }));
    expect(game.hotseat?.active).toBe("opponent");
    expect(mockReplace).toHaveBeenLastCalledWith(
      { query: { name: "opponent" } },
      undefined,
      { shallow: true },
    );
    expect(mockRoute.query.name).toBe("opponent");

    const cover = screen.getByRole("button", { name: /Bob's turn/ });
    expect(cover).toHaveTextContent("tap to reveal");
    fireEvent.click(cover);
    expect(screen.queryByRole("button", { name: /Bob's turn/ })).toBeNull();

    // Play this side on the other box switches back.
    fireEvent.click(screen.getByText("Play this side"));
    expect(game.hotseat?.active).toBe("offline");
    expect(mockRoute.query.name).toBe("offline");
    expect(screen.getByRole("button", { name: /Alice's turn/ })).toBeInTheDocument();
  });

  it("the ⌘ palette lists Switch seat under hotseat", async () => {
    renderOffline();
    await addOpponent();
    openPalette();
    fireEvent.click(screen.getByText("Switch seat"));
    expect(game.hotseat?.active).toBe("opponent");
    expect(mockRoute.query.name).toBe("opponent");
  });

  it("Back to solo removes the opponent and returns to the first seat", async () => {
    renderOffline();
    await addOpponent();
    fireEvent.click(screen.getByRole("button", { name: "Switch seat" }));
    fireEvent.click(screen.getByText("open new game"));
    fireEvent.click(await screen.findByRole("button", { name: "Back to solo" }));
    expect(game.hotseat?.seats).toEqual(["offline"]);
    expect(game.hotseat?.active).toBe("offline");
    expect(mockRoute.query.name).toBe("offline");
    expect(screen.getByRole("button", { name: "Add opponent" })).toBeInTheDocument();
    expect(screen.queryByText(/tap to reveal/i)).toBeNull();
  });
});
