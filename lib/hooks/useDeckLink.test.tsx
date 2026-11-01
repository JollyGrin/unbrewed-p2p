/**
 * #1512: a `?deckId=` deep link adds with source `deeplink`, and a link that
 * can't be fetched reports `deck_add_failed` by status.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { ReactNode } from "react";

import { useDeckLink } from "./useDeckLink";

const mockTrack = jest.fn();
jest.mock("../analytics", () => ({
  ...jest.requireActual("../analytics"),
  track: (...a: unknown[]) => mockTrack(...a),
}));

jest.mock("react-hot-toast", () => {
  const toast: any = () => {};
  toast.success = jest.fn();
  toast.error = jest.fn();
  return { __esModule: true, default: toast, toast };
});

const mockPushDeck = jest.fn(async (..._a: unknown[]) => true);
jest.mock("../bag/useBag", () => ({
  useBagDecks: () => ({
    decks: [],
    isLoading: false,
    pushDeck: mockPushDeck,
    updateDeck: jest.fn(),
    setStar: jest.fn(),
  }),
}));

const mockFetchLinked = jest.fn();
jest.mock("../deckLink", () => ({
  ...jest.requireActual("../deckLink"),
  fetchLinkedDeck: (raw: string) => mockFetchLinked(raw),
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

beforeEach(() => {
  mockTrack.mockClear();
  mockPushDeck.mockClear();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

it("adds a linked deck with source deeplink", async () => {
  const deck = { id: "abc", name: "x", deck_data: { cards: [] } };
  mockFetchLinked.mockResolvedValueOnce({ deck, unsupported: [], skipped: [] });
  renderHook(() => useDeckLink("abc", { ready: true }), { wrapper });
  await waitFor(() => expect(mockPushDeck).toHaveBeenCalledWith(deck, { source: "deeplink" }));
});

it("reports a link that can't be fetched", async () => {
  mockFetchLinked.mockRejectedValueOnce({ response: { status: 404 } });
  renderHook(() => useDeckLink("gone", { ready: true }), { wrapper });
  await waitFor(() =>
    expect(mockTrack).toHaveBeenCalledWith("deck_add_failed", { source: "deeplink", reason: 404 }),
  );
});
