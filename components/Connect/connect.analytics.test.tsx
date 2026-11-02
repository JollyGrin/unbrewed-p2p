/**
 * /connect lobby events (#1511): connecting under the name we rolled creates
 * a lobby; a typed name joins one (invites join on /join). One event per connect.
 */
import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import axios from "axios";
import { ConnectPage } from "./index";
import { __resetBagStoresForTests } from "@/lib/bag/bagStore";

const push = jest.fn();
let mockQuery: Record<string, string> = {};

jest.mock("next/router", () => ({
  useRouter: () => ({ query: mockQuery, push, prefetch: jest.fn() }),
}));
jest.mock("axios", () => ({
  __esModule: true,
  default: { get: jest.fn().mockResolvedValue({ data: "ok" }) },
}));
jest.mock("react-hot-toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));
jest.mock("react-focus-lock", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("../SiteNav", () => ({ SiteNav: () => null }));
jest.mock("../Discord", () => ({ DiscordPresence: () => null }));
jest.mock("../Settings/settings.modal", () => ({
  SettingsModal: () => null,
}));
jest.mock("../../lib/account/useAccount", () => ({
  useAccount: () => ({ status: "guest" }),
}));
jest.mock("../../lib/hooks", () => ({
  ...jest.requireActual("../../lib/hooks"),
  useLoadRouterDeck: () => ({ isLoading: false, error: undefined }),
}));
jest.mock("../../lib/bag/useBag", () => ({
  useBagDecks: () => ({
    starredDeck: { id: "d", name: "Deck" },
    decks: [{ id: "d", name: "Deck" }],
    setStar: jest.fn(),
    isLoading: false,
  }),
  useBagMaps: () => ({ data: [] }),
}));
const track = jest.fn();
jest.mock("../../lib/analytics", () => ({
  track: (...a: unknown[]) => track(...a),
}));
jest.mock("./SelectedDeck", () => ({ SelectedDeckContainer: () => null }));

Element.prototype.scrollIntoView = jest.fn();

const renderConnect = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ChakraProvider>
        <ConnectPage />
      </ChakraProvider>
    </QueryClientProvider>,
  );

const connect = async (lobby?: string) => {
  if (lobby !== undefined)
    fireEvent.change(screen.getByPlaceholderText("lobby name"), {
      target: { value: lobby },
    });
  fireEvent.click(screen.getByText("Connect to Game"));
  await waitFor(() => expect(push).toHaveBeenCalled());
};

beforeEach(() => {
  push.mockClear();
  track.mockClear();
  mockQuery = {};
  localStorage.clear();
  __resetBagStoresForTests();
});

describe("/connect — lobby analytics", () => {
  it("the rolled lobby name creates a lobby", async () => {
    renderConnect();
    await connect();
    expect(track.mock.calls).toEqual([
      ["lobby_created", { mode: "sandbox", deck_source: undefined }],
    ]);
  });

  it("a re-rolled name still creates one", async () => {
    renderConnect();
    fireEvent.click(screen.getByLabelText("Reroll lobby name"));
    await connect();
    expect(track.mock.calls.map((c) => c[0])).toEqual(["lobby_created"]);
  });

  it("a typed name joins", async () => {
    renderConnect();
    await connect("friends-room");
    expect(track.mock.calls).toEqual([["lobby_joined", { mode: "sandbox" }]]);
  });
});

describe("/connect — a lobby answer for a lobby the page no longer shows (#1528)", () => {
  /** The relay call hangs until the test answers it. */
  const holdRelay = () => {
    let answer!: () => void;
    (axios.get as jest.Mock).mockImplementationOnce(
      () => new Promise((resolve) => (answer = () => resolve({ data: "ok" }))),
    );
    return () => act(async () => answer());
  };

  it("the lobby field edited mid-request: no push, no lobby event, button usable again", async () => {
    const answer = holdRelay();
    renderConnect();
    fireEvent.change(screen.getByPlaceholderText("lobby name"), { target: { value: "lobby-a" } });
    fireEvent.click(screen.getByText("Connect to Game"));
    fireEvent.change(screen.getByPlaceholderText("lobby name"), { target: { value: "lobby-b" } });

    await answer();

    expect(push).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
    expect(screen.getByText("Connect to Game").closest("button")).toBeEnabled();
  });

  it("a remount mid-request (GameErrorBoundary's silent recovery) doesn't push to the re-rolled lobby", async () => {
    const answer = holdRelay();
    const client = new QueryClient();
    const page = () => (
      <QueryClientProvider client={client}>
        <ChakraProvider>
          <ConnectPage />
        </ChakraProvider>
      </QueryClientProvider>
    );
    const first = render(page());
    fireEvent.change(screen.getByPlaceholderText("lobby name"), { target: { value: "lobby-a" } });
    fireEvent.click(screen.getByText("Connect to Game"));
    first.unmount();
    render(page()); // fresh mount, random lobby name, same in-flight query

    await answer();

    expect(push).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
  });
});
