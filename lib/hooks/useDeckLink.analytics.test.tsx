/**
 * `share_link_opened` {kind: deck, source: deeplink} (#1513): once for the
 * `?deckId=` the page (/irl, /offline, /table) opened with. A deckId /irl
 * writes itself after an in-game deck switch is not a landing.
 */
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Router from "next/router";
import type { ReactNode } from "react";
import { useDeckLink } from "./useDeckLink";
import { resetGrowthAnalytics } from "../growthAnalytics";

const track = jest.fn();
jest.mock("../analytics", () => ({ track: (...args: unknown[]) => track(...args) }));
jest.mock("../bag/useBag", () => ({
  useBagDecks: () => ({
    decks: [{ id: "saved-deck", version_id: "1" }],
    isLoading: false,
    pushDeck: jest.fn(),
    updateDeck: jest.fn(),
    setStar: jest.fn(),
  }),
}));

const flush = () => act(async () => { jest.advanceTimersByTime(50); });

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

type Props = { deckId?: string; ready: boolean };
const renderLink = (initialProps: Props) =>
  renderHook(({ deckId, ready }: Props) => useDeckLink(deckId, { ready }), { wrapper, initialProps });

beforeEach(() => {
  jest.useFakeTimers();
  track.mockClear();
  resetGrowthAnalytics();
});
afterEach(() => jest.useRealTimers());

describe("share_link_opened (deeplink)", () => {
  it("fires once when the router is ready with a ?deckId=", async () => {
    const { rerender } = renderLink({ deckId: undefined, ready: false });
    rerender({ deckId: "saved-deck", ready: true });
    rerender({ deckId: "other-deck", ready: true });
    await flush();
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("share_link_opened", { kind: "deck", source: "deeplink" });
  });

  it("ignores a ?deckId= reached by an in-app link (the bag's Playtest in person)", async () => {
    Router.events.emit("routeChangeStart", "/irl?deckId=saved-deck", { shallow: false });
    renderLink({ deckId: "saved-deck", ready: true });
    await flush();
    expect(track).not.toHaveBeenCalled();
  });

  it("ignores a deckId the page wrote after opening without one", async () => {
    const { rerender } = renderLink({ deckId: undefined, ready: true });
    rerender({ deckId: "saved-deck", ready: true });
    await flush();
    expect(track).not.toHaveBeenCalled();
  });
});
