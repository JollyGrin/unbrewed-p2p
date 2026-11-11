/**
 * #1609 review: `useBagDecks` hands back a NEW array every render. With a bag
 * of only malformed decks, /join's filtered list must still settle, or the
 * "new player" branch (fresh state each time) re-runs forever.
 */
import { act, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { JoinPage } from "./index";

jest.mock("../../lib/analytics", () => ({ track: jest.fn() }));
const router = {
  isReady: true,
  query: { gid: "lobby-1" } as Record<string, string>,
  push: jest.fn(),
  prefetch: jest.fn(() => Promise.resolve()),
};
jest.mock("next/router", () => ({ useRouter: () => router }));
let renders = 0;
const setStar = jest.fn();
jest.mock("../../lib/bag/useBag", () => ({
  useBagDecks: () => {
    renders += 1;
    // A loop fails fast instead of hanging the run.
    if (renders > 50) throw new Error("/join re-rendered without settling");
    // A fresh array (and fresh deck objects) on every call, as the real hook.
    return { decks: [{ id: "broken", deck_data: {} }], star: "broken", setStar };
  },
}));
const guest = { status: "guest" };
jest.mock("../../lib/account/useAccount", () => ({ useAccount: () => guest }));
const mockFetch = jest.fn(() => new Promise(() => {}));
jest.mock("../../lib/invite", () => ({
  fetchDeckById: (...a: unknown[]) => mockFetch(...(a as [])),
  isValidServerUrl: () => false,
  persistAndStarDeck: jest.fn(),
  randomPlayerName: () => "Guest",
  // A fresh object each call: re-running the branch would re-render.
  randomPopularDeck: () => ({ id: "popular", name: "Popular" }),
}));
const servers = { activeServer: "wss://relay.test", setActiveServer: jest.fn() };
jest.mock("../../lib/hooks/useLocalStorage", () => ({
  DEFAULT_SERVER: "wss://relay.test",
  useLocalServerStorage: () => servers,
}));
jest.mock("react-hot-toast", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

it("settles on a malformed-only bag that is a new array every render", async () => {
  render(
    <ChakraProvider>
      <JoinPage />
    </ChakraProvider>,
  );
  await act(() => new Promise((r) => setTimeout(r, 100)));
  const settled = renders;
  await act(() => new Promise((r) => setTimeout(r, 100)));
  expect(renders).toBe(settled);
  expect(renders).toBeLessThan(20);
  // the brand-new-player path ran once: one popular deck fetched
  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(setStar).not.toHaveBeenCalled();
});
