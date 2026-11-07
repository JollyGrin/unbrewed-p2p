/**
 * /bag's Decks tab (#1538): the paste bar on top, the starred deck as one
 * "★ Up next" card whose buttons name their table, every other deck a tile
 * that becomes Up next when tapped, and "Edit deck" swapping the panel for
 * the deck's detail screen with a way back (#816). jest renders Chakra's
 * BASE breakpoint, so this is the ~390px layout: the detail screen's
 * secondary actions sit behind the overflow menu.
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";

import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { BagDecks } from ".";

const mockTrack = jest.fn();
jest.mock("../../../lib/analytics", () => ({
  ...jest.requireActual("../../../lib/analytics"),
  track: (...a: unknown[]) => mockTrack(...a),
}));
const mockPush = jest.fn();
let mockQuery: Record<string, string> = {};
jest.mock("next/router", () => ({
  useRouter: () => ({ asPath: "/bag", query: mockQuery, push: (...a: unknown[]) => mockPush(...a) }),
}));
// Relative paths, not the `@/` alias: SWC rewrites alias imports but leaves a
// `jest.mock()` string alone. Everything around the layout is stubbed — the
// shelf, the swap and the detail screen are what's under test.
jest.mock("../../../lib/bag/useBag", () => ({
  useBagDecks: () => mockBag,
  useBagMaps: () => ({ data: [], importMaps: async () => 0 }),
}));
jest.mock("../../../lib/account/useAccount", () => ({
  useAccount: () => ({ status: "guest" }),
}));
jest.mock("../../../lib/storage/breakdown", () => ({
  useStorageBreakdown: () => ({}),
}));
jest.mock("./Stats", () => ({ DeckStats: () => null }));
jest.mock("./DeckCards", () => ({ DeckCards: () => <p>deck cards</p> }));
jest.mock("../Map/MapModal", () => ({ MapModal: () => null }));
jest.mock("../Account", () => ({
  BagSourceChip: () => null,
  ShareItemButton: () => null,
}));

const deck = (id: string, name: string, extra: Partial<DeckImportType> = {}) =>
  ({
    id,
    name,
    version_id: "1",
    deck_data: { cards: [], appearance: {}, hero: { hp: 15, move: 2, isRanged: false, name } },
    ...extra,
  }) as unknown as DeckImportType;

let mockBag: Record<string, unknown>;
const bag = (decks: DeckImportType[], extra: Record<string, unknown> = {}) => {
  mockBag = {
    decks,
    pushDeck: jest.fn(),
    removeDeckbyId: jest.fn(),
    updateDeck: jest.fn(),
    setStar: jest.fn(),
    star: decks[0]?.id,
    clearDecks: jest.fn(async () => undefined),
    clearStar: jest.fn(),
    isLoading: false,
    sourceOf: () => "device",
    cloudIdOf: () => undefined,
    ...extra,
  };
  return mockBag;
};

const renderBag = () =>
  render(
    <ChakraProvider>
      <BagDecks />
    </ChakraProvider>,
  );

const pasteBar = () => screen.getByPlaceholderText("Paste a deck link, code or JSON");
const upNext = () => screen.getByTestId("up-next");

/*
  Chakra's MenuList is still `visibility: hidden` mid-open-animation in jsdom,
  which empties every item's accessible name — so read them by text instead.
*/
const menuItems = () => screen.getAllByRole("menuitem", { hidden: true });
const menuItem = (label: string) => {
  const item = menuItems().find((el) => el.textContent === label);
  if (!item) throw new Error(`no "${label}" menu item`);
  return item;
};

beforeEach(() => {
  mockTrack.mockClear();
  mockPush.mockClear();
  mockQuery = {};
});

describe("BagDecks", () => {
  it("shows the starred deck as Up next, with buttons that name their table", () => {
    bag([deck("a", "Alpha"), deck("b", "Bravo")]);
    renderBag();

    expect(pasteBar()).toBeVisible();
    expect(upNext()).toHaveTextContent("★ Up next");
    expect(upNext()).toHaveTextContent("Alpha");
    expect(upNext()).toHaveTextContent("❤ 15");
    expect(upNext()).toHaveTextContent("Map: The Mended Drum");

    expect(screen.getByRole("link", { name: "▶ Solo table" })).toHaveAttribute("href", "/offline?deckId=a");
    expect(screen.getByRole("link", { name: "⚔ Invite a friend" })).toHaveAttribute("href", "/connect");
    expect(screen.getByRole("link", { name: "📱 In person" })).toHaveAttribute("href", "/irl?deckId=a");
    // no generic "Play" anywhere: the buttons say where they go
    expect(screen.queryByRole("button", { name: /^play$/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /^play$/i })).toBeNull();

    fireEvent.click(screen.getByRole("link", { name: "▶ Solo table" }));
    expect(mockTrack).toHaveBeenCalledWith("bag_table_opened", { destination: "offline", from: "upnext" });
  });

  it("carries a map picked on this page to the sandbox tables, not to /irl", () => {
    mockQuery = { mapUrl: "/maps/legacy-the-chalk.webp" };
    bag([deck("a", "Alpha")]);
    renderBag();
    expect(upNext()).toHaveTextContent("Map: The Chalk");
    expect(screen.getByRole("link", { name: "▶ Solo table" })).toHaveAttribute(
      "href",
      "/offline?deckId=a&mapUrl=%2Fmaps%2Flegacy-the-chalk.webp",
    );
    expect(screen.getByRole("link", { name: "📱 In person" })).toHaveAttribute("href", "/irl?deckId=a");

    fireEvent.click(screen.getByRole("button", { name: "change" }));
    expect(mockPush).toHaveBeenCalledWith({ query: { ...mockQuery, editMapUrl: true } });
  });

  it("every other deck is a tile; tapping one makes it Up next", () => {
    const { setStar } = bag([deck("a", "Alpha"), deck("b", "Bravo"), deck("c", "Charlie")]);
    renderBag();

    const tiles = screen.getAllByRole("button", { name: /make it up next/ });
    expect(tiles.map((t) => t.getAttribute("aria-label"))).toEqual([
      "Bravo: make it up next",
      "Charlie: make it up next",
    ]);
    fireEvent.click(tiles[0]);
    expect(setStar).toHaveBeenCalledWith("b");
  });

  it("'+ Add another' focuses the paste bar", () => {
    bag([deck("a", "Alpha")]);
    renderBag();
    fireEvent.click(screen.getByRole("button", { name: /Add another/ }));
    expect(pasteBar()).toHaveFocus();
  });

  it("Edit deck opens the detail screen with the secondary actions behind a menu, and comes back", () => {
    bag([deck("a", "Alpha"), deck("b", "Bravo")]);
    renderBag();

    fireEvent.click(screen.getByRole("button", { name: "Edit deck" }));
    expect(screen.getByRole("heading", { name: "Alpha" })).toBeVisible();
    expect(screen.getByText("deck cards")).toBeVisible();
    expect(screen.queryByTestId("up-next")).toBeNull();
    expect(screen.queryByPlaceholderText("Paste a deck link, code or JSON")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "More deck actions" }));
    expect(menuItems().map((item) => item.textContent)).toEqual([
      "Edit cardback",
      "Tokens",
      "Copy JSON",
      "Toss from bag",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Back to your bag" }));
    expect(upNext()).toBeVisible();
    expect(pasteBar()).toBeVisible();
  });

  it("an image deck's detail menu also offers Edit hero info; an account deck a share link", () => {
    bag([deck("a", "Alpha", { tags: ["image-deck"] })], { cloudIdOf: () => "row-1" });
    renderBag();
    expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit deck" }));
    fireEvent.click(screen.getByRole("button", { name: "More deck actions" }));
    expect(menuItems().map((item) => item.textContent)).toEqual([
      "Edit hero info",
      "Edit cardback",
      "Tokens",
      "Share link",
      "Copy JSON",
      "Toss from bag",
    ]);
  });

  it("tossing from the detail menu asks first, then drops the deck and returns to the shelf", () => {
    const { removeDeckbyId } = bag([deck("a", "Alpha"), deck("b", "Bravo")]);
    renderBag();

    fireEvent.click(screen.getByRole("button", { name: "Edit deck" }));
    fireEvent.click(screen.getByRole("button", { name: "More deck actions" }));
    fireEvent.click(menuItem("Toss from bag"));
    expect(removeDeckbyId).not.toHaveBeenCalled();
    expect(screen.getByText("Toss Alpha from your bag?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Yes, toss it" }));

    expect(removeDeckbyId).toHaveBeenCalledWith("a");
    expect(mockTrack).toHaveBeenCalledWith("deck_removed", { source: undefined });
    expect(pasteBar()).toBeVisible();
  });

  it("Toss on the Up next card is two taps: Cancel keeps the deck, Yes tosses it (review)", () => {
    const { removeDeckbyId } = bag([deck("a", "Alpha")]);
    renderBag();
    fireEvent.click(screen.getByRole("button", { name: "Toss" }));
    expect(removeDeckbyId).not.toHaveBeenCalled();
    expect(screen.getByText("Toss Alpha?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(removeDeckbyId).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Toss" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Toss" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    expect(removeDeckbyId).toHaveBeenCalledWith("a");
  });

  it("tossing the Up next deck stars the next one, or clears the star when the bag empties (review)", () => {
    const { setStar } = bag([deck("a", "Alpha"), deck("b", "Bravo")]);
    renderBag();
    fireEvent.click(screen.getByRole("button", { name: "Toss" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    expect(setStar).toHaveBeenCalledWith("b");

    const { clearStar, setStar: setStar2 } = bag([deck("a", "Alpha")]);
    renderBag();
    fireEvent.click(screen.getAllByRole("button", { name: "Toss" }).at(-1)!);
    fireEvent.click(screen.getAllByRole("button", { name: "Yes" }).at(-1)!);
    expect(clearStar).toHaveBeenCalled();
    expect(setStar2).not.toHaveBeenCalled();
  });

  it("Clear bag is back, low-key under the tiles, with the same confirm (review)", () => {
    const { clearDecks } = bag([deck("a", "Alpha"), deck("b", "Bravo")]);
    renderBag();
    fireEvent.click(screen.getByRole("button", { name: "Clear bag" }));
    expect(clearDecks).not.toHaveBeenCalled();
    expect(screen.getByText("Toss all 2 decks?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(clearDecks).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Clear bag" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear all 2" }));
    expect(clearDecks).toHaveBeenCalled();
  });

  it("keeps a still-loading account bag on a spinner, never a flash of empty", () => {
    bag([], { isLoading: true, star: undefined });
    renderBag();
    expect(screen.getByText("Loading your bag…")).toBeVisible();
    expect(screen.queryByText(/Your bag is empty/)).toBeNull();
    expect(pasteBar()).toBeVisible();
  });

  it("an empty bag says so under the paste bar", () => {
    bag([], { star: undefined });
    renderBag();
    expect(screen.getByText(/Your bag is empty/)).toBeVisible();
    expect(pasteBar()).toBeVisible();
    expect(screen.queryByTestId("up-next")).toBeNull();
  });

  it("with nothing starred, every deck is a tile and there is no Up next card", () => {
    bag([deck("a", "Alpha"), deck("b", "Bravo")], { star: "" });
    renderBag();
    expect(screen.queryByTestId("up-next")).toBeNull();
    expect(screen.getAllByRole("button", { name: /make it up next/ })).toHaveLength(2);
  });
});
