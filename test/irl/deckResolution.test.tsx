import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import toast from "react-hot-toast";

import { API_URL } from "@/lib/account/apiUrl";
import { __resetAccountStoreForTests } from "@/lib/account/useAccount";
import { __resetBagStoresForTests } from "@/lib/bag/bagStore";
import { fetchDeckById } from "@/lib/evergreenDecks";
import { LS_KEY } from "@/lib/hooks/useLocalStorage";
import Irl from "@/pages/irl";

/**
 * /irl?deckId=… resolves its deck from the bag, else fetches it (#825).
 *
 * A signed-in user's bag arrives in two halves: the device half on mount, the
 * account half one round trip later. "Not in the bag, fetch it" must wait for
 * both — a fetch fired against the device half alone can fail on its own and
 * toast "Error fetching deck" over a deck that then loads from the account.
 *
 * Real bag store + real useUnmatchedDeck; only the network and the heavy game
 * tray are faked. The account's deck payload is held behind a promise so the
 * not-yet-synced window outlasts useUnmatchedDeck's 300ms debounce.
 */

const mockRouter = {
  query: {} as Record<string, string>,
  isReady: true,
  replace: jest.fn(),
};
jest.mock("next/router", () => ({ useRouter: () => mockRouter }));

jest.mock("react-hot-toast", () => {
  const toast = Object.assign(jest.fn(), {
    success: jest.fn(),
    error: jest.fn(),
  });
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
    require("react").createElement("div", { "data-testid": "irl-shell" }, deck.name),
}));

jest.mock("../../lib/contexts/OfflineGameProvider", () => ({
  OfflineGameProvider: ({ children }: { children: unknown }) => children,
}));

const fetchDeck = fetchDeckById as jest.Mock;

const deck = (id: string, name = id) =>
  ({ id, name, version_id: `${id}-v1`, deck_data: { cards: [] } }) as any;

const reply = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

/**
 * A signed-in account holding `decks`. Each payload read waits on the returned
 * `release()` — until then the bag is device-only and `isLoading` is true.
 */
const signedInWithCloudDecks = (decks: any[]) => {
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  const rows = decks.map((d, i) => ({
    id: `row-${i}`,
    name: d.name,
    bytes: 128,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
  }));
  global.fetch = jest.fn(async (url: string) => {
    const path = url.replace(API_URL, "");
    if (path === "/me") {
      return reply(200, { user: { id: "u1", username: "JollyGrin", avatarUrl: null } });
    }
    if (path === "/bag/decks") return reply(200, { decks: rows });
    const row = rows.findIndex((r) => path === `/bag/decks/${r.id}`);
    if (row >= 0) {
      await released;
      return reply(200, { id: rows[row].id, name: rows[row].name, data: decks[row] });
    }
    return reply(404, { error: "not_found" });
  }) as unknown as typeof fetch;
  return { release };
};

/** Longer than useUnmatchedDeck's 300ms debounce, so a queued fetch fires. */
const pastTheDebounce = () =>
  act(() => new Promise((resolve) => setTimeout(resolve, 450)));

const renderIrl = (deckId: string) => {
  mockRouter.query = { deckId, name: "offline" };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
    logger: { log: () => {}, warn: () => {}, error: () => {} },
  });
  return render(
    <ChakraProvider>
      <QueryClientProvider client={client}>
        <Irl />
      </QueryClientProvider>
    </ChakraProvider>,
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  localStorage.clear();
  __resetAccountStoreForTests();
  __resetBagStoresForTests();
});

afterEach(() => {
  (console.error as jest.Mock).mockRestore();
});

describe("/irl deck resolution against a signed-in bag (#825)", () => {
  it("waits for the account half before fetching, so a cloud deck never toasts an error", async () => {
    const { release } = signedInWithCloudDecks([deck("cloud-deck", "Cloud Bruce")]);
    fetchDeck.mockRejectedValue(new Error("private deck: 404"));

    renderIrl("cloud-deck");

    // The device half is empty and the account half hasn't landed yet: the
    // page must keep waiting rather than decide the deck isn't in the bag.
    await pastTheDebounce();
    expect(fetchDeck).not.toHaveBeenCalled();
    expect(screen.getByText("Loading your deck…")).toBeInTheDocument();

    release();
    expect(await screen.findByTestId("irl-shell")).toHaveTextContent("Cloud Bruce");

    await pastTheDebounce();
    expect(fetchDeck).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("still plays a device deck at once, without waiting on the account", async () => {
    localStorage.setItem(LS_KEY.DECKS, JSON.stringify([deck("device-deck", "Device Alice")]));
    const { release } = signedInWithCloudDecks([deck("other-deck")]);

    renderIrl("device-deck");

    expect(await screen.findByTestId("irl-shell")).toHaveTextContent("Device Alice");
    expect(fetchDeck).not.toHaveBeenCalled();
    release();
  });

  it("still fetches — and reports the failure — when the deck is in neither half", async () => {
    const { release } = signedInWithCloudDecks([deck("cloud-deck")]);
    fetchDeck.mockRejectedValue(new Error("not found"));

    renderIrl("bad-link");
    release();

    expect(await screen.findByText("Couldn't load that deck")).toBeInTheDocument();
    expect(fetchDeck).toHaveBeenCalledWith("bad-link");
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Error fetching deck"));
  });
});
