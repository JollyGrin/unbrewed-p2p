import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { act, render, screen } from "@testing-library/react";

import Offline from "@/pages/offline";
import { useWebGame } from "@/lib/contexts/WebGameProvider";
import { useIrlSession } from "@/lib/gameAnalytics";

/**
 * /offline's `?name=` (issue #1564): the shared table resolves `self` from
 * it, and the provider always mounts with the one `offline` seat — so on
 * arrival a missing OR unknown name (a reload mid-hotseat leaves
 * `?name=opponent`) is rewritten before the table mounts. Once the table is
 * up, Switch seat owns the name.
 */

let mockRoute: { query: Record<string, string> } = { query: {} };
const mockListeners = new Set<() => void>();
const mockReplace = jest.fn((url: { query: Record<string, string> }) => {
  mockRoute = { query: url.query };
  mockListeners.forEach((l) => l());
  return Promise.resolve(true);
});
jest.mock("next/router", () => ({
  useRouter: () => {
    const route = require("react").useSyncExternalStore(
      (l: () => void) => {
        mockListeners.add(l);
        return () => mockListeners.delete(l);
      },
      () => mockRoute,
    );
    return { ...route, pathname: "/offline", isReady: true, replace: mockReplace };
  },
}));

const ALICE = {
  id: "deck-alice",
  name: "Alice",
  deck_data: {
    appearance: {},
    hero: { name: "Alice", hp: 15, move: 2, isRanged: false, specialAbility: "" },
    sidekick: { name: "", hp: null, isRanged: false, quantity: 0, quote: "" },
    cards: [{ title: "Alice card", quantity: 6, imageUrl: "https://img/a.png" }],
  },
};
jest.mock("../../lib/bag/useBag", () => ({
  useBagDecks: () => ({ decks: [ALICE], starredDeck: ALICE, isLoading: false }),
}));
jest.mock("../../lib/hooks/useDeckLink", () => ({
  useDeckLink: () => ({ failed: false }),
}));
jest.mock("../../lib/gameAnalytics", () => ({ useIrlSession: jest.fn() }));
jest.mock("../../components/Helmet/Head", () => ({ PageSeo: () => null }));
jest.mock("../../components/DeckLink/DeckRefreshOnTable", () => ({
  DeckRefreshOnTable: () => null,
}));
jest.mock("../../components/DeckLink/DeckLinkHold", () => ({
  DeckLinkHold: () => null,
  DeckLinkNotice: () => null,
}));

// The table itself is out of scope: a stand-in that shows which seat it is.
let mockGame: ReturnType<typeof useWebGame> | undefined;
jest.mock("../../components/Game/GameShell", () => ({
  GameShell: () => {
    const { useRouter } = require("next/router");
    mockGame = require("../../lib/contexts/WebGameProvider").useWebGame();
    return <div data-testid="table">{useRouter().query.name}</div>;
  },
}));

const land = (query: Record<string, string>) => {
  mockRoute = { query };
  render(
    <ChakraProvider>
      <Offline />
    </ChakraProvider>,
  );
};

beforeEach(() => {
  mockReplace.mockClear();
  (useIrlSession as jest.Mock).mockClear();
  mockGame = undefined;
});

it("plays as `offline` straight away when the URL already says so", () => {
  land({ name: "offline" });
  expect(mockReplace).not.toHaveBeenCalled();
  expect(screen.getByTestId("table")).toHaveTextContent("offline");
});

it("rewrites a missing name", () => {
  land({});
  expect(mockReplace).toHaveBeenCalledWith(
    { query: { name: "offline" } },
    undefined,
    { shallow: true },
  );
  expect(screen.getByTestId("table")).toHaveTextContent("offline");
});

it("rewrites an unknown name (a reload mid-hotseat) before the table mounts", () => {
  land({ name: "opponent", mapUrl: "m" });
  expect(mockReplace).toHaveBeenCalledWith(
    { query: { name: "offline", mapUrl: "m" } },
    undefined,
    { shallow: true },
  );
  expect(screen.getByTestId("table")).toHaveTextContent("offline");
});

it("leaves a switched seat's name alone once the table is up, and reports the seats", () => {
  land({ name: "offline" });
  expect((useIrlSession as jest.Mock).mock.lastCall[0].hotseat?.seats).toEqual(["offline"]);

  act(() => mockGame!.hotseat!.addSeat(ALICE as any));
  act(() => {
    mockGame!.hotseat!.setActive("opponent");
    mockRoute = { query: { name: "opponent" } };
    mockListeners.forEach((l) => l());
  });
  expect(mockReplace).not.toHaveBeenCalled();
  expect(screen.getByTestId("table")).toHaveTextContent("opponent");
  expect((useIrlSession as jest.Mock).mock.lastCall[0].hotseat?.seats).toEqual([
    "offline",
    "opponent",
  ]);
});
