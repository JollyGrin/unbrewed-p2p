import "@testing-library/jest-dom";
import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { JoinPage } from "./index";

/**
 * Sandbox name prefill for the accounts epic (issue #568): a signed-in player
 * lands on the invite page with their Discord name already in the field, and a
 * guest keeps today's random one.
 *
 * Rendered in <StrictMode> ON PURPOSE. The first cut of this feature moved its
 * bookkeeping ref inside a `setName(current => …)` updater; StrictMode
 * double-invokes updaters to surface impurity, and the second pass saw the
 * already-moved ref, concluded the player had typed the name, and restored the
 * random one — a bug invisible outside StrictMode (and in production builds).
 */

let mockAccount: {
  status: string;
  account: { id: string; username: string; avatarUrl: string | null } | null;
} = { status: "guest", account: null };

jest.mock("../../lib/account/useAccount", () => ({
  ...jest.requireActual("../../lib/account/useAccount"),
  useAccount: () => mockAccount,
}));

jest.mock("next/router", () => ({
  useRouter: () => ({
    query: { gid: "test-lobby" },
    isReady: true,
    push: jest.fn(),
    prefetch: jest.fn(),
  }),
}));

jest.mock("axios", () => ({ get: jest.fn().mockResolvedValue({ data: {} }) }));

jest.mock("../../lib/hooks/useLocalStorage", () => ({
  DEFAULT_SERVER: "https://server.test",
  LS_KEY: { STAR_DECK: "star-deck" },
  useLocalServerStorage: () => ({
    activeServer: "https://server.test",
    setActiveServer: jest.fn(),
  }),
}));

// The bag is account-first now (#644); this page only reads from it.
jest.mock("../../lib/bag/useBag", () => ({
  useBagDecks: () => ({
    decks: [{ id: "d1", name: "A deck" }],
    star: "d1",
    setStar: jest.fn(),
  }),
}));

jest.mock("../../lib/invite", () => ({
  fetchDeckById: jest.fn().mockResolvedValue({ id: "d1", name: "A deck" }),
  isValidServerUrl: () => true,
  persistAndStarDeck: jest.fn(),
  randomPlayerName: () => "RandomGuest",
  randomPopularDeck: () => ({ id: "pop1", name: "Popular deck" }),
}));

const renderJoin = () =>
  render(
    <StrictMode>
      <ChakraProvider>
        <JoinPage />
      </ChakraProvider>
    </StrictMode>,
  );

const nameField = () => screen.getByPlaceholderText("Your name") as HTMLInputElement;

describe("Join page name prefill (issue #568)", () => {
  it("keeps the random name for a guest", async () => {
    mockAccount = { status: "guest", account: null };
    renderJoin();
    await waitFor(() => expect(nameField().value).toBe("RandomGuest"));
  });

  it("keeps the random name when the accounts API is unreachable", async () => {
    mockAccount = { status: "offline", account: null };
    renderJoin();
    await waitFor(() => expect(nameField().value).toBe("RandomGuest"));
  });

  it("prefills the Discord username when signed in", async () => {
    mockAccount = {
      status: "signed-in",
      account: { id: "u1", username: "JollyGrin", avatarUrl: null },
    };
    renderJoin();
    await waitFor(() => expect(nameField().value).toBe("JollyGrin"));
  });
});
