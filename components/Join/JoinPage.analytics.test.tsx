/**
 * `join_link_opened` {mode: sandbox} (#1513): once per landing on /join with
 * a lobby (`?gid=`).
 */
import { act, render } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { JoinPage } from "./index";
import { resetGrowthAnalytics } from "../../lib/growthAnalytics";

const track = jest.fn();
jest.mock("../../lib/analytics", () => ({ track: (...args: unknown[]) => track(...args) }));

const nav = { push: jest.fn(), prefetch: jest.fn(() => Promise.resolve()) };
let router = { isReady: false, query: {} as Record<string, string>, ...nav };
jest.mock("next/router", () => ({ useRouter: () => router }));
// Stable values: the page's effects depend on them.
const bag = { decks: [], star: undefined, setStar: jest.fn() };
jest.mock("../../lib/bag/useBag", () => ({ useBagDecks: () => bag }));
const guest = { status: "guest" };
jest.mock("../../lib/account/useAccount", () => ({ useAccount: () => guest }));
jest.mock("../../lib/invite", () => ({
  fetchDeckById: () => new Promise(() => {}),
  isValidServerUrl: () => false,
  persistAndStarDeck: jest.fn(),
  randomPlayerName: () => "Guest",
  randomPopularDeck: () => ({ id: "popular", name: "Popular" }),
}));
const servers = { activeServer: "wss://relay.test", setActiveServer: jest.fn() };
jest.mock("../../lib/hooks/useLocalStorage", () => ({
  DEFAULT_SERVER: "wss://relay.test",
  useLocalServerStorage: () => servers,
}));
jest.mock("react-hot-toast", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const flush = () => act(() => new Promise((r) => setTimeout(r, 50)));
const view = () => (
  <ChakraProvider>
    <JoinPage />
  </ChakraProvider>
);

beforeEach(() => {
  track.mockClear();
  resetGrowthAnalytics();
});

describe("join_link_opened (/join)", () => {
  it("fires once when the router is ready with a lobby", async () => {
    router = { isReady: false, query: {}, ...nav };
    const { rerender } = render(view());
    await flush();
    expect(track).not.toHaveBeenCalled();
    router = { isReady: true, query: { gid: "lobby-1" }, ...nav };
    rerender(view());
    rerender(view());
    await flush();
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("join_link_opened", { mode: "sandbox" });
  });

  it("does not fire for /join with no lobby", async () => {
    router = { isReady: true, query: {}, ...nav };
    render(view());
    await flush();
    expect(track).not.toHaveBeenCalled();
  });
});
