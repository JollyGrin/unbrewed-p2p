/**
 * #1609: /join never picks, stars or offers a malformed bag deck (no name,
 * hero or cards), even the starred one.
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
const good = { id: "good", name: "Good Deck", deck_data: { hero: {}, cards: [] } };
const broken = { id: "broken", deck_data: {} };
// Stable values: the page's effects depend on them.
const bag = { decks: [broken, good], star: "broken", setStar: jest.fn() };
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

it("offers only playable decks and defaults past a malformed starred one", async () => {
  render(
    <ChakraProvider>
      <JoinPage />
    </ChakraProvider>,
  );
  await act(() => new Promise((r) => setTimeout(r, 50)));
  const select = screen.getByRole("combobox") as HTMLSelectElement;
  expect([...select.options].map((o) => o.value)).toEqual(["good"]);
  expect(select.value).toBe("good");
});
