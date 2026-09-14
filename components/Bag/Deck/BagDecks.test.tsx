/**
 * /bag's Decks tab on a phone (#816). jest renders Chakra's BASE breakpoint
 * (desktop-only UI is display:none), so this is the ~390px layout:
 *
 *  - the rail and the detail pane SWAP instead of stacking in one fixed box —
 *    tapping "Add" from a stocked bag gives the add panel the whole screen,
 *    and there's a way back to the list;
 *  - an empty bag (where /irl's "Open your bag" lands) opens straight onto
 *    the add panel;
 *  - a deck's two primary actions share one foot bar, and everything
 *    secondary sits behind a menu instead of wrapping at equal weight.
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";

import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { BagDecks } from ".";

jest.mock("next/router", () => ({
  useRouter: () => ({ asPath: "/bag", query: {}, push: jest.fn() }),
}));
// Relative paths, not the `@/` alias: SWC rewrites alias imports but leaves a
// `jest.mock()` string alone. Everything around the layout is stubbed — the
// swap and the action bar are what's under test.
jest.mock("../../../lib/bag/useBag", () => ({
  useBagDecks: () => mockBag,
}));
jest.mock("../../../lib/account/useAccount", () => ({
  useAccount: () => ({ status: "guest" }),
}));
jest.mock("../../../lib/storage/breakdown", () => ({
  useStorageBreakdown: () => ({}),
}));
jest.mock("./Stats", () => ({ DeckStats: () => null }));
jest.mock("./DeckCards", () => ({ DeckCards: () => <p>deck cards</p> }));
jest.mock("../AddDeckHub", () => ({
  AddDeckHub: () => <p>Add a deck to your bag</p>,
}));
jest.mock("../Account", () => ({
  BagSourceChip: () => null,
  ShareItemButton: () => null,
}));

const deck = (id: string, name: string) =>
  ({
    id,
    name,
    version_id: "1",
    deck_data: { cards: [], appearance: {} },
  }) as unknown as DeckImportType;

let mockBag: Record<string, unknown>;
const bag = (decks: DeckImportType[], extra: Record<string, unknown> = {}) => {
  mockBag = {
    decks,
    pushDeck: jest.fn(),
    removeDeckbyId: jest.fn(),
    updateDeck: jest.fn(),
    setStar: jest.fn(),
    star: undefined,
    clearDecks: jest.fn(),
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

const addPanel = () => screen.getByText("Add a deck to your bag");

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

describe("BagDecks on mobile", () => {
  it("gives the add panel the whole screen from a stocked bag, and comes back", () => {
    bag([deck("a", "Alpha"), deck("b", "Bravo")]);
    renderBag();

    expect(screen.getByText("Alpha")).toBeVisible();
    expect(addPanel()).not.toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(addPanel()).toBeVisible();
    expect(screen.getByText("Alpha")).not.toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Your bag (2)" }));
    expect(screen.getByText("Alpha")).toBeVisible();
    expect(addPanel()).not.toBeVisible();
  });

  it("opens an empty bag straight onto the add panel, with nothing to go back to", () => {
    bag([]);
    renderBag();

    expect(addPanel()).toBeVisible();
    expect(screen.queryByRole("button", { name: /your bag/i })).toBeNull();
  });

  it("keeps a still-loading account bag on the rail rather than the add panel", () => {
    bag([], { isLoading: true });
    renderBag();

    expect(screen.getByText("Loading your bag…")).toBeVisible();
    expect(addPanel()).not.toBeVisible();
  });

  it("promotes the two primary actions into one bar and menus the rest", () => {
    const { setStar } = bag([deck("a", "Alpha"), deck("b", "Bravo")]);
    renderBag();

    fireEvent.click(screen.getByText("Alpha"));
    expect(screen.getByRole("heading", { name: "Alpha" })).toBeVisible();
    expect(screen.getByText("Bravo")).not.toBeVisible();

    const use = screen.getByRole("button", { name: "★ Use this deck" });
    const playtest = screen.getByRole("link", { name: "Playtest in person" });
    expect(playtest).toHaveAttribute("href", "/irl?deckId=a");
    expect(use.parentElement).toBe(playtest.parentElement);

    // the desktop row's equal-weight secondaries aren't on screen...
    expect(screen.queryByRole("button", { name: "Copy JSON" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Toss" })).toBeNull();

    // ...they're behind the overflow menu
    fireEvent.click(screen.getByRole("button", { name: "More deck actions" }));
    expect(menuItems().map((item) => item.textContent)).toEqual([
      "Edit cardback",
      "Tokens",
      "Copy JSON",
      "Toss from bag",
    ]);

    fireEvent.click(use);
    expect(setStar).toHaveBeenCalledWith("a");
  });

  it("tossing from the menu drops the deck and returns to the list", () => {
    const { removeDeckbyId } = bag([deck("a", "Alpha"), deck("b", "Bravo")]);
    renderBag();

    fireEvent.click(screen.getByText("Alpha"));
    fireEvent.click(screen.getByRole("button", { name: "More deck actions" }));
    fireEvent.click(menuItem("Toss from bag"));

    expect(removeDeckbyId).toHaveBeenCalledWith("a");
    expect(screen.getByText("Bravo")).toBeVisible();
  });

  it("goes back from a deck to the list", () => {
    bag([deck("a", "Alpha"), deck("b", "Bravo")]);
    renderBag();

    fireEvent.click(screen.getByText("Alpha"));
    fireEvent.click(screen.getByRole("button", { name: "Back to your bag" }));
    expect(screen.getByText("Bravo")).toBeVisible();
  });
});
