import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import toast from "react-hot-toast";
import type { ComponentType } from "react";

import { __resetAccountStoreForTests } from "@/lib/account/useAccount";
import { __resetBagStoresForTests } from "@/lib/bag/bagStore";
import { fetchDeckById } from "@/lib/evergreenDecks";
import { LS_KEY } from "@/lib/hooks/useLocalStorage";
import { LABS_API, fetchLabsImport } from "@/lib/labs";
import setBySlug from "@/lib/labs/fixtures/set-by-slug.dumbass-brigade.json";
import galleryCharacter from "@/lib/labs/fixtures/gallery-character.marouine.json";
import Irl from "@/pages/irl";
import Offline from "@/pages/offline";

/**
 * `?deckId=labs:char_<uuid>` deep links (#979) on /offline and /irl, against
 * the real Marouine payload from #905 — and the pin that an unprefixed
 * `?deckId=` still goes to unmatched.cards and nowhere else.
 *
 * Real bag store, real useUnmatchedDeck and the real Labs fetcher; only the
 * network, unmatched.cards and the heavy game surfaces are faked.
 */

const mockRouter = {
  query: {} as Record<string, string>,
  isReady: true,
  replace: jest.fn(),
};
jest.mock("next/router", () => ({ useRouter: () => mockRouter }));

jest.mock("react-hot-toast", () => {
  const toast = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() });
  return { __esModule: true, default: toast, toast };
});

jest.mock("../../lib/evergreenDecks", () => ({
  ...jest.requireActual("../../lib/evergreenDecks"),
  fetchDeckById: jest.fn(),
}));

jest.mock("../../components/Irl/irlOffline", () => ({
  ...jest.requireActual("../../components/Irl/irlOffline"),
  useIrlServiceWorker: () => {},
}));

jest.mock("../../components/Irl/IrlShell", () => ({
  IrlShell: ({ deck }: { deck: { name: string } }) =>
    require("react").createElement("div", { "data-testid": "table" }, deck.name),
}));

// /offline's table reads the starred deck from the bag, like HandContainer.
jest.mock("../../components/Game/GameShell", () => ({
  GameShell: () => {
    const { useBagDecks } = require("../../lib/bag/useBag");
    const { starredDeck } = useBagDecks();
    return require("react").createElement("div", { "data-testid": "table" }, starredDeck?.name);
  },
}));

jest.mock("../../lib/contexts/OfflineGameProvider", () => ({
  OfflineGameProvider: ({ children }: { children: unknown }) => children,
}));

jest.mock("../../components/Helmet/Head", () => ({ PageSeo: () => null }));

// Chakra's Modal focus trap uses a selector the pinned jsdom/nwsapi can't
// parse (see test/pro/lobbySetupRail.test.tsx); the trap is a browser concern.
jest.mock("@chakra-ui/focus-lock", () => ({
  __esModule: true,
  FocusLock: ({ children }: { children: unknown }) => children,
}));

const fetchDeck = fetchDeckById as jest.Mock;
const MAROUINE = "char_ce316d14-8bc8-413d-9086-ad37b502d0fe";

// jsdom lacks structuredClone
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const reply = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

/** Signed out; Labs answers from the recorded Marouine fixtures. */
const network = (set: unknown = setBySlug, gate?: Promise<void>) => {
  const labsCalls: string[] = [];
  global.fetch = jest.fn(async (url: string) => {
    const u = String(url);
    if (!u.startsWith(LABS_API)) return reply(401, { error: "unauthorized" });
    labsCalls.push(u);
    await gate;
    if (u.includes("gallery_characters")) return reply(200, galleryCharacter);
    if (u.includes("rpc/set_by_slug")) return reply(200, set);
    if (u.includes("profiles")) return reply(200, [{ display_name: "TheNullProfessor" }]);
    return reply(404, []);
  }) as unknown as typeof fetch;
  return { labsCalls };
};

/** Longer than useUnmatchedDeck's 300ms debounce, so a queued fetch fires. */
const pastTheDebounce = () => act(() => new Promise((resolve) => setTimeout(resolve, 450)));

const renderPage = (Page: ComponentType, deckId: string) => {
  mockRouter.query = { deckId, name: "offline" };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
    logger: { log: () => {}, warn: () => {}, error: () => {} },
  });
  return render(
    <ChakraProvider>
      <QueryClientProvider client={client}>
        <Page />
      </QueryClientProvider>
    </ChakraProvider>,
  );
};

const bagIds = () =>
  (JSON.parse(localStorage.getItem(LS_KEY.DECKS) ?? "[]") as { id: string }[]).map((d) => d.id);

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  localStorage.clear();
  __resetAccountStoreForTests();
  __resetBagStoresForTests();
});

afterEach(() => {
  (console.error as jest.Mock).mockRestore();
  (console.warn as jest.Mock).mockRestore();
});

describe.each([
  ["/offline", Offline],
  ["/irl", Irl],
] as const)("%s ?deckId= deep links (#979)", (_route, Page) => {
  it("loads the Marouine Labs deck into a playable table", async () => {
    const { labsCalls } = network();

    renderPage(Page, `labs:${MAROUINE}`);

    expect(await screen.findByTestId("table", {}, { timeout: 3000 })).toHaveTextContent("Marouine");
    expect(bagIds()).toContain(`labs-${MAROUINE}`);
    expect(labsCalls.length).toBeGreaterThan(0);
    expect(fetchDeck).not.toHaveBeenCalled();
  });

  it("holds a deck our template can't draw behind the Labs guidance", async () => {
    const set = clone(setBySlug) as any;
    const flinch = set[0].document.set.cards.find((c: any) => c.title === "Flinch");
    flinch.split = true;
    // no finished render from Labs, so Flinch falls back to our template
    delete set[0].card_previews[`card:${flinch.id}:front`];
    network(set);

    renderPage(Page, `labs:${MAROUINE}`);

    expect(
      await screen.findByText(/won't look right with our card template/, {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Split cards/)).toBeInTheDocument();
    expect(screen.getByText("Export Tabletop Simulator object")).toBeInTheDocument();
    expect(screen.queryByTestId("table")).not.toBeInTheDocument();
    expect(bagIds()).not.toContain(`labs-${MAROUINE}`);

    fireEvent.click(screen.getByRole("button", { name: "Play anyway" }));
    expect(await screen.findByTestId("table")).toHaveTextContent("Marouine");
  });

  it("plays a fully rendered deck straight away, as Labs' finished card art (#994)", async () => {
    const set = clone(setBySlug) as any;
    // a feature our template can't draw, on a card Labs rendered: no hold
    set[0].document.set.cards.find((c: any) => c.title === "Flinch").split = true;
    network(set);

    renderPage(Page, `labs:${MAROUINE}`);

    expect(await screen.findByTestId("table", {}, { timeout: 3000 })).toHaveTextContent("Marouine");
    expect(screen.queryByRole("button", { name: "Play anyway" })).not.toBeInTheDocument();
    const saved = JSON.parse(localStorage.getItem(LS_KEY.DECKS) ?? "[]").find(
      (d: { id: string }) => d.id === `labs-${MAROUINE}`,
    );
    const pointBlank = saved.deck_data.cards.find((c: any) => c.title === "Point Blank");
    expect(pointBlank.cardImage.url).toBe(
      set[0].card_previews["card:card_fdb8832c-a56e-4b08-8e6b-a23bba913976:front"],
    );
  });

  it("shows the existing failure state for a Labs character that isn't published", async () => {
    network([]);

    renderPage(Page, `labs:${MAROUINE}`);

    expect(
      await screen.findByText("Couldn't load that deck", {}, { timeout: 3000 }),
    ).toBeInTheDocument();
  });

  it("keeps an unprefixed id on unmatched.cards, exactly as before", async () => {
    const { labsCalls } = network();
    fetchDeck.mockResolvedValue({ id: "pk1x", name: "Bruce Lee", version_id: "pk1x-v1", deck_data: { cards: [] } });

    renderPage(Page, "pk1x");

    expect(await screen.findByTestId("table")).toHaveTextContent("Bruce Lee");
    expect(fetchDeck).toHaveBeenCalledTimes(1);
    expect(fetchDeck).toHaveBeenCalledWith("pk1x");
    expect(labsCalls).toEqual([]);
  });

  it("still stars an unprefixed id already in the bag without fetching", async () => {
    const { labsCalls } = network();
    localStorage.setItem(
      LS_KEY.DECKS,
      JSON.stringify([{ id: "pk1x", name: "Bagged Bruce", version_id: "pk1x-v1", deck_data: { cards: [] } }]),
    );

    renderPage(Page, "pk1x-v1");

    expect(await screen.findByTestId("table")).toHaveTextContent("Bagged Bruce");
    await pastTheDebounce();
    expect(fetchDeck).not.toHaveBeenCalled();
    expect(labsCalls).toEqual([]);
    expect(toast.success).not.toHaveBeenCalledWith(expect.stringMatching(/Updated/));
  });
});

/**
 * #996: a Labs deck already in the bag plays straight away, and is refetched
 * behind it so an edit on Labs shows on the next click.
 */
const BAG_ID = `labs-${MAROUINE}`;
const POINT_BLANK = "card:card_fdb8832c-a56e-4b08-8e6b-a23bba913976:front";
const HERO_CARD = `character-card:${MAROUINE}:front`;

/** Revision B of the recorded set: one card and the hero card re-rendered. */
const revisionB = () => {
  const set = clone(setBySlug) as any;
  set[0].revision = set[0].revision + 1;
  set[0].card_previews[POINT_BLANK] = "https://labs.example/point-blank-b.png";
  set[0].card_previews[HERO_CARD] = "https://labs.example/marouine-b.png";
  return set;
};

const PLAYER_TOKEN = { imageUrl: "https://example.com/my-marker.png", size: 60 };

/** Revision A (the recorded set) saved in the bag, with the player's own loadout. */
const savedRevisionA = async () => {
  network();
  const { deck } = await fetchLabsImport({ kind: "character", characterId: MAROUINE });
  const saved = {
    ...deck,
    name: "Bagged Marouine",
    savedTokens: [...(deck.savedTokens ?? []), PLAYER_TOKEN],
    savedTokenColor: "#123456",
  };
  localStorage.setItem(LS_KEY.DECKS, JSON.stringify([saved]));
  localStorage.setItem(LS_KEY.STAR_DECK, BAG_ID);
  jest.clearAllMocks();
  return saved;
};

const bagDeck = () =>
  (JSON.parse(localStorage.getItem(LS_KEY.DECKS) ?? "[]") as any[]).find((d) => d.id === BAG_ID);

describe.each([
  ["/offline", Offline],
  ["/irl", Irl],
] as const)("%s refreshes a Labs deck already in the bag (#996)", (_route, Page) => {
  it("plays the saved copy at once, then replaces it with the newer revision", async () => {
    const saved = await savedRevisionA();
    let answer!: () => void;
    const { labsCalls } = network(revisionB(), new Promise((resolve) => (answer = resolve)));

    renderPage(Page, `labs:${MAROUINE}`);

    // the table is up on the saved copy while Labs hasn't answered yet
    expect(await screen.findByTestId("table")).toHaveTextContent("Bagged Marouine");
    await pastTheDebounce();
    expect(bagDeck().version_id).toBe(saved.version_id);
    answer();

    await waitFor(() => expect(bagDeck().version_id).not.toBe(saved.version_id), {
      timeout: 3000,
    });
    const refreshed = bagDeck();
    expect(refreshed.version_id).toBe(String(revisionB()[0].revision));
    expect(refreshed.name).toBe("Marouine");
    const pointBlank = refreshed.deck_data.cards.find((c: any) => c.title === "Point Blank");
    expect(pointBlank.cardImage.url).toBe("https://labs.example/point-blank-b.png");
    // the player's own loadout and colour survive; the hero-card token
    // points at the new render instead of the old one
    expect(refreshed.savedTokenColor).toBe("#123456");
    expect(refreshed.savedTokens).toEqual([
      expect.objectContaining({ imageUrl: "https://labs.example/marouine-b.png" }),
      PLAYER_TOKEN,
    ]);
    expect(localStorage.getItem(LS_KEY.STAR_DECK)).toBe(BAG_ID);
    expect(bagIds()).toEqual([BAG_ID]);
    // one click, one Labs import: character, set, author
    expect(labsCalls).toHaveLength(3);
    if (_route === "/offline") {
      expect(await screen.findByTestId("table")).toHaveTextContent(/^Marouine$/);
    }
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/latest version/));
  });

  it("leaves the bag alone when Labs has the same revision", async () => {
    const saved = await savedRevisionA();
    const before = localStorage.getItem(LS_KEY.DECKS);
    const { labsCalls } = network();

    renderPage(Page, `labs:${MAROUINE}`);

    expect(await screen.findByTestId("table")).toHaveTextContent("Bagged Marouine");
    await waitFor(() => expect(labsCalls).toHaveLength(3), { timeout: 3000 });
    await pastTheDebounce();
    expect(localStorage.getItem(LS_KEY.DECKS)).toBe(before);
    expect(bagDeck().name).toBe(saved.name);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("replaces a deck whose revision is the same but whose renders changed", async () => {
    await savedRevisionA();
    const set = clone(setBySlug) as any;
    set[0].card_previews[POINT_BLANK] = "https://labs.example/point-blank-rerender.png";
    network(set);

    renderPage(Page, `labs:${MAROUINE}`);

    await waitFor(
      () =>
        expect(
          bagDeck().deck_data.cards.find((c: any) => c.title === "Point Blank").cardImage.url,
        ).toBe("https://labs.example/point-blank-rerender.png"),
      { timeout: 3000 },
    );
  });

  it("keeps playing the saved copy when Labs can't be reached", async () => {
    await savedRevisionA();
    const before = localStorage.getItem(LS_KEY.DECKS);
    global.fetch = jest.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;

    renderPage(Page, `labs:${MAROUINE}`);

    expect(await screen.findByTestId("table")).toHaveTextContent("Bagged Marouine");
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringMatching(/saved copy/)), {
      timeout: 3000,
    });
    expect(screen.getByTestId("table")).toHaveTextContent("Bagged Marouine");
    expect(screen.queryByText("Couldn't load that deck")).not.toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
    expect(localStorage.getItem(LS_KEY.DECKS)).toBe(before);
  });

  it("shows the Labs guidance over the saved copy when the new revision trips it", async () => {
    await savedRevisionA();
    const set = revisionB();
    const flinch = set[0].document.set.cards.find((c: any) => c.title === "Flinch");
    flinch.split = true;
    delete set[0].card_previews[`card:${flinch.id}:front`];
    network(set);

    renderPage(Page, `labs:${MAROUINE}`);

    expect(await screen.findByTestId("table")).toHaveTextContent("Bagged Marouine");
    expect(
      await screen.findByText(/won't look right with our card template/, {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Split cards/)).toBeInTheDocument();
    expect(bagDeck().name).toBe("Bagged Marouine");

    fireEvent.click(screen.getByRole("button", { name: "Play anyway" }));
    await waitFor(() => expect(bagDeck().name).toBe("Marouine"));
  });
});
