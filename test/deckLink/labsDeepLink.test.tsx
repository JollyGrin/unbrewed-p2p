import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";

import { __resetAccountStoreForTests } from "@/lib/account/useAccount";
import { __resetBagStoresForTests } from "@/lib/bag/bagStore";
import { fetchDeckById } from "@/lib/evergreenDecks";
import { LS_KEY } from "@/lib/hooks/useLocalStorage";
import { LABS_API } from "@/lib/labs";
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

const fetchDeck = fetchDeckById as jest.Mock;
const MAROUINE = "char_ce316d14-8bc8-413d-9086-ad37b502d0fe";

// jsdom lacks structuredClone
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const reply = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

/** Signed out; Labs answers from the recorded Marouine fixtures. */
const network = (set: unknown = setBySlug) => {
  const labsCalls: string[] = [];
  global.fetch = jest.fn(async (url: string) => {
    const u = String(url);
    if (!u.startsWith(LABS_API)) return reply(401, { error: "unauthorized" });
    labsCalls.push(u);
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

  it("stars a Labs deck already in the bag without fetching", async () => {
    const { labsCalls } = network();
    localStorage.setItem(
      LS_KEY.DECKS,
      JSON.stringify([
        { id: `labs-${MAROUINE}`, name: "Bagged Marouine", deck_data: { cards: [] } },
      ]),
    );

    renderPage(Page, `labs:${MAROUINE}`);

    expect(await screen.findByTestId("table")).toHaveTextContent("Bagged Marouine");
    await pastTheDebounce();
    expect(labsCalls).toEqual([]);
    expect(fetchDeck).not.toHaveBeenCalled();
  });

  it("holds a deck our template can't draw behind the Labs guidance", async () => {
    const set = clone(setBySlug) as any;
    const flinch = set[0].document.set.cards.find((c: any) => c.title === "Flinch");
    flinch.split = true;
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
    network();
    localStorage.setItem(
      LS_KEY.DECKS,
      JSON.stringify([{ id: "pk1x", name: "Bagged Bruce", version_id: "pk1x-v1", deck_data: { cards: [] } }]),
    );

    renderPage(Page, "pk1x-v1");

    expect(await screen.findByTestId("table")).toHaveTextContent("Bagged Bruce");
    await pastTheDebounce();
    expect(fetchDeck).not.toHaveBeenCalled();
  });
});
