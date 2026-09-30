import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import type { DeckImportType } from "@/components/DeckPool/deck-import.type";
import {
  FIXTURES,
  elliotDeck,
  labsDeck,
} from "@/lib/tableplace/fixtures/decks";
import type { TablePlaceError } from "@/lib/tableplace/api";
import lucySet from "@/lib/labs/fixtures/set-by-slug.lucy-piper.json";
import lucySave from "@/lib/labs/fixtures/tts-save.lucy-piper.json";
import {
  buildLabsImport,
  parseLabsTtsMap,
  parseLabsTtsSave,
  type LabsSetRow,
} from "@/lib/labs";
import type { MapData } from "@/lib/hooks/useLocalStorage";
import { MAP_CATALOG } from "@/lib/pro/mapCatalog";
import { theme } from "@/styles/style";
import { TablePage } from "./TablePage";

jest.mock("next/router", () => ({
  useRouter: () => ({ query: {}, isReady: true }),
}));
jest.mock("../Navbar", () => ({ Navbar: () => <nav /> }));
jest.mock("../DeckLink/DeckLinkHold", () => ({
  DeckLinkHold: () => <div data-testid="deck-link-hold" />,
}));
const mockLink: { held?: { refresh: boolean }; failed: boolean } = {
  failed: false,
};
jest.mock("../../lib/hooks/useDeckLink", () => ({
  useDeckLink: () => mockLink,
}));

// A full TablePage render is slow on a loaded machine; the inner waits stay under this.
jest.setTimeout(20_000);

const mockValidate = jest.fn();
const mockCreate = jest.fn();
jest.mock("../../lib/tableplace/api", () => ({
  ...jest.requireActual("../../lib/tableplace/api"),
  validateLobby: (...a: unknown[]) => mockValidate(...a),
  createLobby: (...a: unknown[]) => mockCreate(...a),
}));
const mockFetchLinked = jest.fn();
jest.mock("../../lib/deckLink", () => ({
  ...jest.requireActual("../../lib/deckLink"),
  fetchLinkedDeck: (...a: unknown[]) => mockFetchLinked(...a),
}));

const mockMaps: MapData[] = [{ imgUrl: "/m1.webp" }, { imgUrl: "/m2.webp" }];
// The bag: its decks, and the star the page starts with. Starring works.
const mockBag: { decks: DeckImportType[]; star: string; isLoading: boolean } = {
  decks: [],
  star: "",
  isLoading: false,
};
jest.mock("../../lib/bag/useBag", () => {
  const { useState } = jest.requireActual("react");
  return {
    useBagDecks: () => {
      const [star, setStar] = useState(mockBag.star);
      return {
        decks: mockBag.decks,
        starredDeck: mockBag.decks.find((d) => d.id === star),
        setStar,
        isLoading: mockBag.isLoading,
      };
    },
    useBagMaps: () => ({ data: mockMaps }),
  };
});
const mockSize = { width: 1000, height: 800 };
const mockImageSize = { fresh: false, failed: false };
jest.mock("./useImageSize", () => ({
  useImageSize: (url?: string) => ({
    // `fresh`: an equal-but-new object every render, as a real hook may hand back.
    size:
      !url || mockImageSize.failed
        ? null
        : mockImageSize.fresh
          ? { ...mockSize }
          : mockSize,
    isLoading: false,
    failed: !!url && mockImageSize.failed,
  }),
}));

const err = (over: Partial<TablePlaceError>): TablePlaceError => ({
  status: 400,
  code: "missing_deck_slot",
  message: "Pack 'x' (seat 0) is missing deck slot 'deck'.",
  retryable: false,
  ...over,
});

const oak = () => FIXTURES["hollow-oak"].deck;
const tab = (id: "you" | "them" | "map") => screen.getByTestId(`tab-${id}`);
const slot = (id: "you" | "them" | "map") => screen.getByTestId(`slot-${id}`);
const selectedTab = () =>
  screen
    .getAllByRole("tab")
    .find((t) => t.getAttribute("aria-selected") === "true")
    ?.getAttribute("data-testid");
const tiles = (kind: "deck" | "map") =>
  screen.queryAllByTestId(`${kind}-tile`) as HTMLButtonElement[];
const deckTile = (id: string) =>
  tiles("deck").find((t) => t.dataset.deck === id)!;
const mapTile = (url: string) =>
  tiles("map").find((t) => t.dataset.url === url)!;
const pickMap = (url: string) => {
  fireEvent.click(tab("map"));
  fireEvent.click(mapTile(url));
};
const create = () => screen.getByTestId("create") as HTMLButtonElement;

const createTable = async () => {
  // A click on a disabled button is a silent no-op: make sure it's live.
  await waitFor(() => expect(create().disabled).toBe(false), {
    timeout: 10_000,
  });
  fireEvent.click(create());
  return screen.findByTestId("api-error", {}, { timeout: 10_000 });
};

/** The app's theme: without its breakpoints no responsive style resolves. */
const Themed = ({ children }: { children: React.ReactNode }) => (
  <ChakraProvider theme={theme}>{children}</ChakraProvider>
);

/** A bag of fresh decks (nothing carries over), the first one starred. */
const bag = (decks: DeckImportType[], star = decks[0]?.id ?? "") => {
  mockBag.decks = decks;
  mockBag.star = star;
};

/** Your deck starred, their deck picked from the bag, a map on the table. */
const setup = (themed = false) => {
  const [mine, theirs] = [labsDeck(), elliotDeck()];
  bag([mine, theirs]);
  render(<TablePage />, themed ? { wrapper: Themed } : undefined);
  fireEvent.click(tab("them"));
  fireEvent.click(deckTile(theirs.id));
  pickMap("/m1.webp");
  return { mine, theirs };
};

afterEach(() => {
  mockValidate.mockReset();
  mockCreate.mockReset();
  mockFetchLinked.mockReset();
  mockImageSize.fresh = false;
  mockImageSize.failed = false;
  mockBag.isLoading = false;
  mockLink.held = undefined;
  mockLink.failed = false;
});

describe("TablePage — create flow error box (issue #1061)", () => {
  it("a non-retryable 4xx shows friendly copy, the API message in <details>, and report links", async () => {
    mockValidate.mockResolvedValue({ ok: false, error: err({}) });
    setup();
    const box = await createTable();
    expect(box.textContent).toContain(
      "We couldn't lay out this table. That's a bug on our side.",
    );
    const details = box.querySelector("details");
    expect(details?.textContent).toContain("missing deck slot");
    expect(box.querySelector("p")?.textContent).not.toContain("missing deck");
    expect(
      [...box.querySelectorAll("a")].map((a) => a.getAttribute("href")),
    ).toEqual([
      "https://github.com/JollyGrin/unbrewed-p2p/issues/new",
      "https://discord.gg/qPxHFjwkNN",
    ]);
  });

  it("a retryable failure shows the API message and the retry copy, not the bug copy", async () => {
    mockValidate.mockResolvedValue({
      ok: false,
      error: err({
        status: 0,
        code: "timeout",
        message: "table.place didn't answer.",
        retryable: true,
      }),
    });
    setup();
    const box = await createTable();
    expect(box.textContent).toContain("table.place didn't answer.");
    expect(box.textContent).toContain("Try again once you're back online.");
    expect(box.textContent).not.toContain("bug on our side");
  });

  it("clears the error when the composed table changes", async () => {
    mockValidate.mockResolvedValue({ ok: false, error: err({}) });
    setup();
    await createTable();
    fireEvent.click(mapTile("/m2.webp"));
    await waitFor(() => expect(screen.queryByTestId("api-error")).toBeNull());
  });

  it("keeps the error when a render hands back an equal-but-new map size", async () => {
    mockImageSize.fresh = true;
    mockValidate.mockResolvedValue({ ok: false, error: err({}) });
    setup();
    await createTable();
    // Let any effect the error's own re-render triggers run.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId("api-error")).not.toBeNull();
  });
});

const lobby = {
  lobby: "abc",
  lobby_url: "https://table.place/l/abc",
  seats: [
    { seat: 0, url: "https://table.place/l/abc?seat=0" },
    { seat: 1, url: "https://table.place/l/abc?seat=1" },
  ],
  expires_at: "2030-01-01T00:00:00Z",
};

describe("TablePage — create flow, reasons and accessibility (issue #1063)", () => {
  it("creates the table and shows the invite, then keeps the links after 'Make another table'", async () => {
    mockValidate.mockResolvedValue({ ok: true, data: {} });
    mockCreate.mockResolvedValue({ ok: true, data: lobby });
    const { mine, theirs } = setup();
    await waitFor(() => expect(create().disabled).toBe(false), {
      timeout: 10_000,
    });
    fireEvent.click(create());
    await screen.findByTestId("invite", {}, { timeout: 10_000 });
    // the same two decks went out, yours in seat 0
    expect(mockCreate.mock.calls[0][0]).toBe(mockValidate.mock.calls[0][0]);
    const packs = mockCreate.mock.calls[0][0].packs.map(
      (p: { id: string }) => p.id,
    );
    expect(packs.some((id: string) => id.endsWith("-seat0"))).toBe(true);
    expect(packs.some((id: string) => id.endsWith("-seat1"))).toBe(true);
    expect(mine.id).not.toBe(theirs.id);
    fireEvent.click(screen.getByText("Make another table"));
    const last = await screen.findByTestId("last-table");
    expect(
      [...last.querySelectorAll("a")].map((a) => a.getAttribute("href")),
    ).toEqual(lobby.seats.map((s) => s.url));
  });

  it("names the missing pieces until all three are picked, then says what's ready", () => {
    const [mine, theirs] = [labsDeck(), elliotDeck()];
    bag([mine, theirs], "");
    render(<TablePage />);
    expect(create().disabled).toBe(true);
    expect(screen.getByTestId("status").textContent).toBe(
      "Still needed: your deck, their deck, a map.",
    );
    fireEvent.click(deckTile(mine.id));
    expect(screen.getByTestId("status").textContent).toBe(
      "Still needed: their deck, a map.",
    );
    fireEvent.click(deckTile(theirs.id));
    expect(screen.getByTestId("status").textContent).toBe(
      "Still needed: a map.",
    );
    expect(create().disabled).toBe(true);
    fireEvent.click(mapTile("/m1.webp"));
    expect(screen.getByTestId("status").textContent).toBe(
      "Ready: Marouine vs Elliot Becker on /m1.webp.",
    );
    expect(create().disabled).toBe(false);
  });

  it("shows a starred deck that is refused in your seat, with the reason, and keeps Create disabled", () => {
    bag([oak(), elliotDeck()]);
    render(<TablePage />);
    fireEvent.click(tab("them"));
    fireEvent.click(deckTile(mockBag.decks[1].id));
    fireEvent.click(mapTile("/m1.webp"));
    expect(create().disabled).toBe(true);
    expect(screen.getByTestId("refused-reason").textContent).toContain(
      "One deck can't go on the table yet (see above).",
    );
    expect(screen.queryByTestId("status")).toBeNull();
    expect(within(slot("you")).getByTestId("slot-name").textContent).toBe(
      "The Hollow Oak",
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "Your deck can't go on the table: This deck's cards don't have table images yet.",
    );
    expect(screen.getByTestId("tts-how").textContent).toContain("TTS JSON");
  });

  it("shows a pasted deck that is refused in their seat, with the reason, and keeps Create disabled", async () => {
    mockFetchLinked.mockResolvedValue({ deck: oak() });
    bag([labsDeck()]);
    render(<TablePage />);
    fireEvent.click(tab("them"));
    fireEvent.change(screen.getByTestId("opponent-link"), {
      target: { value: "https://unmatched.cards/decks/pk1x" },
    });
    fireEvent.click(screen.getByText("Load"));
    await waitFor(() =>
      expect(within(slot("them")).getByTestId("slot-name").textContent).toBe(
        "The Hollow Oak",
      ),
    );
    expect(mockFetchLinked).toHaveBeenCalledWith("pk1x");
    pickMap("/m1.webp");
    expect(screen.getByRole("alert").textContent).toContain(
      "Their deck can't go on the table",
    );
    expect(screen.getByTestId("tts-how")).toBeTruthy();
    expect(screen.getByTestId("refused-reason")).toBeTruthy();
    expect(create().disabled).toBe(true);
  });

  it("shows an alert and no Create when the map's image can't be probed", () => {
    mockImageSize.failed = true;
    setup();
    expect(screen.getByRole("alert").textContent).toContain(
      "Couldn't load this map's image",
    );
    expect(create().disabled).toBe(true);
    expect(screen.queryByTestId("status")).toBeNull();
  });

  it("has an h1, real tabs and slots that expose what is selected, and labelled inputs", () => {
    setup();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Set up a 3D table",
    );
    expect(
      screen.getAllByRole("tab").map((t) => [t.tagName, t.textContent]),
    ).toEqual([
      ["BUTTON", "1Your deckMarouine"],
      ["BUTTON", "2Their deckElliot Becker"],
      ["BUTTON", "3Map/m1.webp"],
    ]);
    expect(selectedTab()).toBe("tab-map");
    expect(screen.getByRole("tabpanel").getAttribute("aria-label")).toBe("Map");
    for (const id of ["you", "them", "map"] as const) {
      expect(slot(id).tagName).toBe("BUTTON");
      expect(slot(id).getAttribute("aria-pressed")).toBe(String(id === "map"));
    }
    expect(mapTile("/m1.webp").getAttribute("aria-pressed")).toBe("true");
    expect(mapTile("/m2.webp").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByLabelText("Search maps")).toBe(
      screen.getByTestId("map-search"),
    );
    fireEvent.click(slot("them"));
    expect(selectedTab()).toBe("tab-them");
    expect(screen.getByLabelText(/Not in your bag\?/)).toBe(
      screen.getByTestId("opponent-link"),
    );
  });

  it("has no select on any tab", () => {
    setup();
    for (const id of ["you", "them", "map"] as const) {
      fireEvent.click(tab(id));
      expect(document.querySelector("select")).toBeNull();
      expect(screen.queryByRole("combobox")).toBeNull();
    }
  });

  it("keeps what each deck puts down in a closed disclosure", () => {
    setup();
    const contents = screen.getByTestId("table-contents") as HTMLDetailsElement;
    expect(contents.tagName).toBe("DETAILS");
    expect(contents.open).toBe(false);
    expect(contents.querySelector("summary")?.textContent).toContain(
      "What goes on the table",
    );
    expect(within(contents).getAllByTestId("deck-preview")).toHaveLength(2);
  });
});

describe("TablePage — the phone layout (PR #1121)", () => {
  // Rendered with the theme, so the breakpoints resolve. jsdom matches no
  // media query: what it computes is the layout below `lg`, and the `lg` rule
  // is read off the stylesheet.
  const display = (el: Element) => getComputedStyle(el).display;
  const shownFromLg = (el: Element) => {
    const rules = [...document.styleSheets].flatMap((sheet) => [
      ...sheet.cssRules,
    ]);
    return rules.some(
      (rule) =>
        rule instanceof CSSMediaRule &&
        /min-width:\s*62em/.test(rule.media.mediaText) &&
        [...rule.cssRules].some(
          (inner) =>
            inner instanceof CSSStyleRule &&
            el.matches(inner.selectorText) &&
            inner.style.display === "block",
        ),
    );
  };

  it("hides the intro and the closes-after line on a phone, and only there", () => {
    setup(true);
    for (const id of ["intro", "closes-note"]) {
      const el = screen.getByTestId(id);
      expect(display(el)).toBe("none");
      expect(shownFromLg(el)).toBe(true);
    }
    expect(screen.getByTestId("intro").textContent).toContain(
      "Pick both decks and a map",
    );
    expect(screen.getByTestId("closes-note").textContent).toContain(
      "closes after 15 minutes",
    );
    expect(display(screen.getByRole("heading", { level: 1 }))).not.toBe("none");
    expect(display(screen.getByTestId("status"))).not.toBe("none");
    expect(display(create())).not.toBe("none");
    expect(
      screen.getByTestId("create-bar").contains(screen.getByTestId("status")),
    ).toBe(true);
  });

  it("keeps the API error box in the pinned bar", async () => {
    mockValidate.mockResolvedValue({ ok: false, error: err({}) });
    setup(true);
    const box = await createTable();
    expect(display(box)).not.toBe("none");
    expect(screen.getByTestId("create-bar").contains(box)).toBe(true);
  });

  it("keeps the refused-deck line and the seat's reason", () => {
    bag([oak(), elliotDeck()]);
    render(<TablePage />, { wrapper: Themed });
    fireEvent.click(tab("them"));
    fireEvent.click(deckTile(mockBag.decks[1].id));
    const line = screen.getByTestId("refused-reason");
    expect(display(line)).not.toBe("none");
    expect(screen.getByTestId("create-bar").contains(line)).toBe(true);
    expect(display(screen.getByRole("alert"))).not.toBe("none");
    expect(display(screen.getByTestId("tts-how"))).not.toBe("none");
  });

  it("keeps the map image alert", () => {
    mockImageSize.failed = true;
    setup(true);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Couldn't load this map's image");
    expect(display(alert)).not.toBe("none");
  });
});

describe("TablePage — the deck galleries (issue #1118)", () => {
  it("moves on to the next empty slot after a pick, and stays put once nothing is empty", () => {
    const [mine, theirs] = [labsDeck(), elliotDeck()];
    bag([mine, theirs], "");
    render(<TablePage />);
    expect(selectedTab()).toBe("tab-you");
    fireEvent.click(deckTile(mine.id));
    expect(selectedTab()).toBe("tab-them");
    fireEvent.click(deckTile(theirs.id));
    expect(selectedTab()).toBe("tab-map");
    fireEvent.click(mapTile("/m1.webp"));
    expect(selectedTab()).toBe("tab-map");

    // everything is picked: a new pick changes the seat and nothing else
    fireEvent.click(tab("you"));
    fireEvent.click(deckTile(theirs.id));
    expect(selectedTab()).toBe("tab-you");
    expect(within(slot("you")).getByTestId("slot-name").textContent).toBe(
      "Elliot Becker",
    );
    fireEvent.click(tab("them"));
    fireEvent.click(deckTile(mine.id));
    expect(selectedTab()).toBe("tab-them");
    expect(within(slot("them")).getByTestId("slot-name").textContent).toBe(
      "Marouine",
    );
  });

  it("skips their deck when it is already picked, and goes to the map", () => {
    const [mine, theirs] = [labsDeck(), elliotDeck()];
    bag([mine, theirs], "");
    render(<TablePage />);
    fireEvent.click(tab("them"));
    fireEvent.click(deckTile(theirs.id));
    expect(selectedTab()).toBe("tab-map");
    fireEvent.click(tab("you"));
    fireEvent.click(deckTile(mine.id));
    expect(selectedTab()).toBe("tab-map");
  });

  it("greys a refused deck in its own section with a reason, and won't pick it", () => {
    const [mine, refused] = [labsDeck(), oak()];
    bag([mine, refused]);
    render(<TablePage />);
    const needs = screen.getByTestId("decks-needs");
    expect(needs.querySelector("h2")?.textContent).toBe(
      "Need card images first",
    );
    expect(
      within(needs)
        .getAllByTestId("deck-tile")
        .map((t) => t.dataset.deck),
    ).toEqual([refused.id]);
    expect(
      within(screen.getByTestId("decks-ready"))
        .getAllByTestId("deck-tile")
        .map((t) => t.dataset.deck),
    ).toEqual([mine.id]);
    const tile = deckTile(refused.id);
    expect(tile.disabled).toBe(true);
    expect(within(tile).getByTestId("deck-reason").textContent).toBe(
      "No table images",
    );
    // the fix is said once, on the section, not on each deck
    expect(screen.getAllByTestId("needs-how")).toHaveLength(1);
    expect(screen.getByTestId("needs-how").textContent).toContain("TTS JSON");
    expect(
      screen.getByTestId("needs-how").querySelector("a")?.getAttribute("href"),
    ).toBe("/bag");

    fireEvent.click(tile);
    expect(within(slot("you")).getByTestId("slot-name").textContent).toBe(
      "Marouine",
    );
    fireEvent.click(tab("them"));
    fireEvent.click(deckTile(refused.id));
    expect(within(slot("them")).getByTestId("slot-name").textContent).toBe(
      "Pick their deck",
    );
    expect(selectedTab()).toBe("tab-them");
  });

  it("badges the decks in the seats, the same deck in both when it is", () => {
    const [mine, other] = [labsDeck(), elliotDeck()];
    bag([mine, other]);
    render(<TablePage />);
    expect(deckTile(mine.id).textContent).toContain("You");
    expect(deckTile(mine.id).textContent).not.toContain("Them");
    expect(deckTile(mine.id).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(tab("them"));
    fireEvent.click(deckTile(mine.id));
    fireEvent.click(tab("them"));
    expect(deckTile(mine.id).textContent).toContain("You");
    expect(deckTile(mine.id).textContent).toContain("Them");
    expect(deckTile(other.id).textContent).not.toMatch(/You|Them/);
    expect(screen.getByTestId("status").textContent).toBe(
      "Still needed: a map.",
    );
  });

  it("says an empty bag is empty and links to it, and still takes a pasted link", () => {
    bag([]);
    render(<TablePage />);
    const empty = screen.getByTestId("bag-empty");
    expect(empty.textContent).toContain("Your bag has no decks yet.");
    expect(empty.querySelector("a")?.getAttribute("href")).toBe("/bag");
    expect(screen.queryByTestId("opponent-link")).toBeNull();
    fireEvent.click(tab("them"));
    expect(screen.getByTestId("opponent-link")).toBeTruthy();
    expect(screen.getByTestId("bag-empty")).toBeTruthy();
  });

  it("doesn't call the bag empty while the account's half is still loading", () => {
    bag([]);
    mockBag.isLoading = true;
    render(<TablePage />);
    expect(screen.queryByTestId("bag-empty")).toBeNull();
    expect(screen.getByText("Loading your bag…")).toBeTruthy();
  });

  it("links to the bag for more decks", () => {
    bag([labsDeck()]);
    render(<TablePage />);
    expect(
      screen.getByText("Add more decks in your bag").getAttribute("href"),
    ).toBe("/bag");
  });
});

describe("TablePage — a ?deckId= link (issue #1118)", () => {
  it("shows the Labs hold in place of your gallery, and only there", () => {
    bag([labsDeck()], "");
    mockLink.held = { refresh: false };
    render(<TablePage />);
    expect(screen.getByTestId("deck-link-hold")).toBeTruthy();
    expect(tiles("deck")).toHaveLength(0);
    fireEvent.click(tab("them"));
    expect(screen.queryByTestId("deck-link-hold")).toBeNull();
    expect(tiles("deck")).toHaveLength(1);
  });

  it("keeps your gallery when the hold is a refresh of a saved copy", () => {
    bag([labsDeck()]);
    mockLink.held = { refresh: true };
    render(<TablePage />);
    expect(screen.queryByTestId("deck-link-hold")).toBeNull();
    expect(tiles("deck")).toHaveLength(1);
  });

  it("says your deck is importing while the bag loads, in your seat", () => {
    bag([], "");
    mockBag.isLoading = true;
    render(<TablePage />);
    expect(within(slot("you")).getByTestId("slot-name").textContent).toBe(
      "Importing your deck…",
    );
  });

  it("says the linked deck couldn't be loaded, in your seat", () => {
    bag([labsDeck()], "");
    mockLink.failed = true;
    render(<TablePage />);
    expect(slot("you").textContent).toContain("Couldn't load that deck");
    expect(slot("you").textContent).toContain("Pick one from your bag instead");
    expect(screen.getByTestId("status").textContent).toContain("your deck");
  });
});

describe("TablePage — the map gallery (issue #1118)", () => {
  const sections = () =>
    [...document.querySelectorAll('[data-testid^="maps-"]')]
      .map((el) => el.getAttribute("data-testid"))
      .filter((id) => !id?.endsWith("-toggle"));
  const titles = (group: string) =>
    within(screen.getByTestId(`maps-${group}`))
      .getAllByTestId("map-tile")
      .map((t) => t.dataset.url as string);
  const chip = (name: RegExp) => screen.getByRole("button", { name });

  beforeEach(() => {
    bag([labsDeck()]);
    render(<TablePage />);
    fireEvent.click(tab("map"));
  });

  it("lists Pro boards first in catalog order, then bag maps, then snapping built-ins, then image-only maps", () => {
    expect(sections()).toEqual([
      "maps-pro",
      "maps-bag",
      "maps-spaces",
      "maps-image",
    ]);
    expect(
      titles("pro").map((u) => new URL(u, "https://x.invalid").pathname),
    ).toEqual(
      MAP_CATALOG.filter((e) => !e.hidden).map(
        (e) => new URL(e.map.meta.imageUrl as string).pathname,
      ),
    );
    const pro = screen.getByTestId("maps-pro");
    expect(pro.querySelector("h2")?.textContent).toBe("Pro boards");
    expect(pro.textContent).toContain(
      "The boards Unbrewed Pro plays on. Figures snap to spaces.",
    );
    expect(
      within(pro)
        .getAllByTestId("map-tile")
        .every((t) => t.textContent?.startsWith("Pro")),
    ).toBe(true);
    expect(titles("bag")).toEqual(["/m1.webp", "/m2.webp"]);
    expect(screen.getByTestId("maps-image").textContent).toContain(
      "No mapped spaces. Figures go wherever you put them.",
    );
  });

  it("shows one row of the long groups until asked for all of them", () => {
    expect(titles("spaces")).toHaveLength(5);
    const toggle = screen.getByTestId("maps-spaces-toggle");
    expect(toggle.textContent).toMatch(/^Show all \d+$/);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    const all = Number(toggle.textContent?.replace("Show all ", ""));
    fireEvent.click(toggle);
    expect(titles("spaces")).toHaveLength(all);
    expect(all).toBeGreaterThan(5);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(titles("image")).toHaveLength(5);
  });

  it("keeps the map on the table in a folded group's row", () => {
    fireEvent.click(screen.getByTestId("maps-spaces-toggle"));
    const last = titles("spaces").at(-1)!;
    fireEvent.click(mapTile(last));
    fireEvent.click(screen.getByTestId("maps-spaces-toggle"));
    expect(titles("spaces")).toHaveLength(5);
    expect(titles("spaces")[0]).toBe(last);
    expect(mapTile(last).textContent).toContain("On the table");
  });

  it("counts every filter, and a filter shows all of its maps", () => {
    const count = (name: RegExp) =>
      Number(chip(name).textContent?.match(/\d+$/)?.[0]);
    expect(count(/^Pro boards/)).toBe(14);
    expect(
      count(/^Pro boards/) + count(/^Snaps to spaces/) + count(/^Image only/),
    ).toBe(count(/^All/));
    expect(chip(/^All/).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(chip(/^Image only/));
    expect(chip(/^Image only/).getAttribute("aria-pressed")).toBe("true");
    // the two plain bag maps are image-only too
    expect(sections()).toEqual(["maps-bag", "maps-image"]);
    expect(titles("bag").length + titles("image").length).toBe(
      count(/^Image only/),
    );
    expect(screen.queryByTestId("maps-image-toggle")).toBeNull();

    fireEvent.click(chip(/^Snaps to spaces/));
    expect(sections()).toEqual(["maps-spaces"]);
    expect(titles("spaces")).toHaveLength(count(/^Snaps to spaces/));

    fireEvent.click(chip(/^Pro boards/));
    expect(sections()).toEqual(["maps-pro"]);
  });

  it("searches every group by title, whatever the case", () => {
    fireEvent.change(screen.getByTestId("map-search"), {
      target: { value: "  PYRAMID " },
    });
    expect(sections()).toEqual(["maps-pro"]);
    expect(
      within(screen.getByTestId("maps-pro"))
        .getAllByTestId("map-tile")
        .map((t) => t.textContent),
    ).toEqual(["ProPyramids"]);
    fireEvent.change(screen.getByTestId("map-search"), {
      target: { value: "a" },
    });
    // a search unfolds the long groups
    expect(titles("spaces").length).toBeGreaterThan(5);
    expect(screen.queryByTestId("maps-spaces-toggle")).toBeNull();
    fireEvent.change(screen.getByTestId("map-search"), {
      target: { value: "no such map" },
    });
    expect(sections()).toEqual([]);
    expect(screen.getByTestId("map-none").textContent).toContain(
      "No maps match “no such map”.",
    );
  });

  it("leaves out the junk and lists the Altar once", () => {
    for (const id of ["maps-spaces-toggle", "maps-image-toggle"]) {
      fireEvent.click(screen.getByTestId(id));
    }
    const names = tiles("map").map((t) => t.textContent as string);
    expect(names.some((n) => /forrestofrandomtrash|gigs and/i.test(n))).toBe(
      false,
    );
    expect(names.filter((n) => /Untitled Battlefield/.test(n))).toHaveLength(1);
    expect(names.filter((n) => /Altar/.test(n))).toEqual(["ProThe Altar"]);
    expect(names.some((n) => n.includes("· spaces"))).toBe(false);
  });

  it("rings the picked map and says what kind of board it is on the rail", () => {
    expect(within(slot("map")).getByTestId("slot-name").textContent).toBe(
      "Pick a map",
    );
    const drum = "/maps/legacy-the-mended-drum.webp";
    fireEvent.click(mapTile(drum));
    expect(mapTile(drum).getAttribute("aria-pressed")).toBe("true");
    expect(mapTile(drum).textContent).toContain("On the table");
    expect(slot("map").textContent).toContain("The Mended Drum");
    expect(slot("map").textContent).toContain(
      "Pro board · figures snap to spaces",
    );
    fireEvent.click(mapTile("/m1.webp"));
    expect(mapTile(drum).getAttribute("aria-pressed")).toBe("false");
    expect(slot("map").textContent).toContain(
      "Image only · place figures freely",
    );
    fireEvent.click(mapTile(titles("spaces")[0]));
    expect(slot("map").textContent).toContain("Figures snap to spaces");
  });
});

describe("TablePage — a Labs deck's own map (issue #1056)", () => {
  // Lucy & Piper and the backyard, as a Labs import brings them in today.
  const lucyImport = () =>
    buildLabsImport(
      {
        row: (lucySet as unknown as LabsSetRow[])[0],
        ttsModels: parseLabsTtsSave(lucySave),
        ttsMap: parseLabsTtsMap(lucySave),
      },
      "char_2dd4ea0c-a02c-4297-aeb1-5b761489e1c3",
    );
  const plainMaps = [...mockMaps];
  const setBagMaps = (...maps: typeof mockMaps) =>
    mockMaps.splice(0, mockMaps.length, ...maps);

  afterEach(() => {
    setBagMaps(...plainMaps);
  });

  const lucyTable = (withLayout: boolean) => {
    const { deck, map } = lucyImport();
    const { layout, ...before } = map!.map;
    const yard = withLayout ? { ...before, layout } : before;
    setBagMaps(plainMaps[0], yard);
    bag([deck]);
    mockValidate.mockResolvedValue({ ok: false, error: err({}) });
    render(<TablePage />);
    // a mirror match: Lucy against Lucy
    fireEvent.click(tab("them"));
    fireEvent.click(deckTile(deck.id));
    return yard;
  };

  it("preselects the starred deck's map, marks it, and snaps to its spaces", async () => {
    const yard = lucyTable(true);
    // the map was never empty, so picking their deck didn't move on to it
    expect(selectedTab()).toBe("tab-them");
    fireEvent.click(tab("map"));
    expect(mapTile(yard.imgUrl).getAttribute("aria-pressed")).toBe("true");
    expect(
      within(mapTile(yard.imgUrl)).getByTestId("deck-map-mark").textContent,
    ).toBe("Your deck's map");
    expect(screen.getAllByTestId("deck-map-mark")).toHaveLength(1);
    expect(slot("map").textContent).toContain("Figures snap to spaces");
    expect(screen.queryByTestId("map-no-layout")).toBeNull();
    await createTable();
    expect(mockValidate.mock.calls[0][0].snapPoints).toHaveLength(4 + 34);
  });

  it("the player's own pick wins over the deck's map", () => {
    const yard = lucyTable(true);
    fireEvent.click(tab("map"));
    fireEvent.click(mapTile("/m1.webp"));
    expect(mapTile("/m1.webp").getAttribute("aria-pressed")).toBe("true");
    expect(mapTile(yard.imgUrl).getAttribute("aria-pressed")).toBe("false");
    expect(within(slot("map")).getByTestId("slot-name").textContent).toBe(
      "/m1.webp",
    );
    // still marked as the deck's own, just not on the table
    expect(
      within(mapTile(yard.imgUrl)).getByTestId("deck-map-mark"),
    ).toBeTruthy();
  });

  it("a map imported before its spaces were kept says to re-import, and snaps only the combat spots", async () => {
    lucyTable(false);
    expect(screen.getByTestId("map-no-layout").textContent).toContain(
      "Import the set again",
    );
    expect(slot("map").textContent).toContain(
      "Image only · place figures freely",
    );
    await createTable();
    expect(mockValidate.mock.calls[0][0].snapPoints).toHaveLength(4);
  });
});
