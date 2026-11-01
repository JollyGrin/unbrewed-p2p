import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { JoinPage } from "./index";

/**
 * /join, the "Invite a friend" link (#1511): one `lobby_joined` once the relay
 * answered, before the /game push; none when the relay can't be reached.
 */

const push = jest.fn();
const track = jest.fn();
const mockGet = jest.fn();

jest.mock("../../lib/analytics", () => ({
  track: (...a: unknown[]) => track(...a),
}));
jest.mock("../../lib/account/useAccount", () => ({
  ...jest.requireActual("../../lib/account/useAccount"),
  useAccount: () => ({ status: "guest", account: null }),
}));
jest.mock("next/router", () => ({
  useRouter: () => ({
    query: { gid: "test-lobby" },
    isReady: true,
    push,
    prefetch: jest.fn(),
  }),
}));
jest.mock("axios", () => ({ get: (...a: unknown[]) => mockGet(...a) }));
jest.mock("react-hot-toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));
jest.mock("../../lib/hooks/useLocalStorage", () => ({
  DEFAULT_SERVER: "https://server.test",
  LS_KEY: { STAR_DECK: "star-deck" },
  useLocalServerStorage: () => ({
    activeServer: "https://server.test",
    setActiveServer: jest.fn(),
  }),
}));
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
  persistAndStarDeck: jest.fn().mockResolvedValue(true),
  randomPlayerName: () => "RandomGuest",
  randomPopularDeck: () => ({ id: "pop1", name: "Popular deck" }),
}));

const renderJoin = () =>
  render(
    <ChakraProvider>
      <JoinPage />
    </ChakraProvider>,
  );

const jump = async () =>
  fireEvent.click(await screen.findByText("Jump into the game"));

beforeEach(() => {
  push.mockClear();
  track.mockClear();
  mockGet.mockReset();
});

describe("/join — lobby analytics", () => {
  it("sends one lobby_joined, before the /game push", async () => {
    mockGet.mockResolvedValue({ data: {} });
    // The bag-deck pick also sends deck_selected_for_game (#1512); this pins the lobby event.
    const lobbyCalls = () => track.mock.calls.filter(([event]) => event === "lobby_joined");
    push.mockImplementation(() => expect(lobbyCalls()).toHaveLength(1));
    renderJoin();
    await jump();
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(lobbyCalls()).toEqual([["lobby_joined", { mode: "sandbox" }]]);
    expect(track).toHaveBeenCalledWith("deck_selected_for_game", {
      mode: "sandbox",
      deck_id: "d1",
      source: undefined,
    });
  });

  it("sends nothing when the relay can't be reached", async () => {
    mockGet.mockRejectedValue(new Error("down"));
    jest.spyOn(console, "error").mockImplementation(() => {});
    renderJoin();
    await jump();
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    await screen.findByText("Jump into the game");
    expect(push).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
  });
});
