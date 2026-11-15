/**
 * /collection?hero=<heroId> (p2p #1657) — the link the post-game "Next up"
 * strip opens. On a cold load (the query only exists once the router is ready)
 * it selects that hero instead of the top-ranked one, marks the cards the
 * points afford, scrolls one into view, and clears the nav dot for that hero.
 */
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import axios from "axios";
import fs from "node:fs";
import path from "node:path";

import { CollectionPage, linkedHeroId } from "./CollectionPage";
import { API_URL } from "@/lib/account/apiUrl";
import { __resetAccountStoreForTests } from "@/lib/account/useAccount";
import {
  UPGRADES_SEEN_KEY,
  __resetUpgradeSeenForTest,
  hasUnseenUpgrade,
  noteAffordableUpgrade,
  parseUpgradeSeen,
} from "@/lib/collection/upgradeSeen";

let mockRouter: { asPath: string; isReady: boolean; query: Record<string, string>; push: jest.Mock };
jest.mock("next/router", () => ({ useRouter: () => mockRouter }));
jest.mock("../SiteNav", () => ({ SiteNav: () => <nav /> }));
jest.mock("axios");

const mockedAxios = axios as jest.Mocked<typeof axios>;
const snapshot = (deckId: string) =>
  JSON.parse(fs.readFileSync(path.join(process.cwd(), `public/evergreen-decks/${deckId}.json`), "utf8"));
const KENSHIRO = snapshot("6rDz");
const LUKE = snapshot("luke-skywalker");

const reply = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

const block = (heroId: string, earned: number, available: number) => ({
  heroId,
  earned,
  spent: earned - available,
  adjusted: 0,
  available,
  cards: [],
  tokenRim: { unlockedTier: 0, enabled: false },
});

const CONSTANTS = { cardTierCosts: [50, 150, 400, 1000], tokenRimThresholds: [250, 750, 2000, 5000] };

/** Kenshiro is the richest hero (the default selection) but broke; Luke can afford a Bronze. */
const wire = () => {
  global.fetch = jest.fn(async (url: string) => {
    if (url === `${API_URL}/me`) return reply(200, { user: { id: "u1", username: "Dean" } });
    if (url === `${API_URL}/me/cosmetics`) {
      return reply(200, {
        heroes: [block("kenshiro", 900, 10), block("luke-skywalker", 60, 60)],
        constants: CONSTANTS,
      });
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as unknown as typeof fetch;
};

const page = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <ChakraProvider>
      <QueryClientProvider client={client}>
        <CollectionPage />
      </QueryClientProvider>
    </ChakraProvider>
  );
};

const flush = () =>
  act(async () => {
    await Promise.resolve();
  });

const stored = () => parseUpgradeSeen(window.localStorage.getItem(UPGRADES_SEEN_KEY));
const scrollIntoView = jest.fn();

beforeEach(() => {
  __resetAccountStoreForTests();
  window.localStorage.clear();
  __resetUpgradeSeenForTest();
  scrollIntoView.mockClear();
  Element.prototype.scrollIntoView = scrollIntoView;
  mockRouter = { asPath: "/collection", isReady: true, query: {}, push: jest.fn() };
  mockedAxios.get.mockImplementation(async (url: string) => {
    if (url.includes("6rDz")) return { data: KENSHIRO } as never;
    if (url.includes("luke-skywalker")) return { data: LUKE } as never;
    throw new Error("404");
  });
  wire();
});
afterEach(() => jest.resetAllMocks());

const selectedHero = () => screen.getByTestId("collection-points");

describe("linkedHeroId", () => {
  const ids = ["kenshiro", "thetis-spice"];
  it("reads the param, tolerates arrays, case and whitespace, and ignores a stranger", () => {
    expect(linkedHeroId("kenshiro", ids)).toBe("kenshiro");
    expect(linkedHeroId([" Kenshiro ", "x"], ids)).toBe("kenshiro");
    expect(linkedHeroId("nobody", ids)).toBeNull();
    expect(linkedHeroId(undefined, ids)).toBeNull();
    expect(linkedHeroId("", ids)).toBeNull();
  });
  it("a remix and its base hero answer for each other", () => {
    expect(linkedHeroId("thetis", ids)).toBe("thetis-spice");
    expect(linkedHeroId("kenshiro-spice", ids)).toBe("kenshiro");
  });
});

it("without the param the top-ranked hero is selected, and nothing scrolls", async () => {
  render(page());
  await flush();
  await waitFor(() => expect(within(selectedHero()).getByText("900")).toBeInTheDocument());
  expect(scrollIntoView).not.toHaveBeenCalled();
});

it("cold load: the query arrives after the first render and the linked hero is selected", async () => {
  // A static export's first render has no query; the router fills it in after.
  mockRouter = { ...mockRouter, isReady: false, query: {} };
  const view = render(page());
  await flush();
  mockRouter = { ...mockRouter, isReady: true, query: { hero: "luke-skywalker" } };
  view.rerender(page());
  await flush();

  await waitFor(() => expect(within(selectedHero()).getAllByText("60").length).toBeGreaterThan(0));
  // 60 points afford a Bronze (50) on every card of the deck: each is marked.
  await waitFor(() => expect(screen.getAllByTestId("card-can-afford").length).toBeGreaterThan(0));
  expect(screen.getAllByTestId("card-can-afford")[0]).toHaveTextContent("Can afford");
  await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
  const target = scrollIntoView.mock.instances[0] as HTMLElement;
  expect(target).toHaveAttribute("data-affordable", "true");
});

it("a hero that cannot afford anything carries no mark", async () => {
  mockRouter.query = { hero: "kenshiro" };
  render(page());
  await flush();
  await waitFor(() => expect(screen.getAllByText(/more to go/).length).toBeGreaterThan(0));
  expect(screen.queryByTestId("card-can-afford")).toBeNull();
  expect(scrollIntoView).not.toHaveBeenCalled();
});

it("the nav dot a game lit clears on the visit to that hero — and only that hero", async () => {
  noteAffordableUpgrade("luke-skywalker", 1);
  expect(hasUnseenUpgrade(stored())).toBe(true);

  // Landing on Kenshiro (no param) leaves Luke's upgrade unseen.
  const view = render(page());
  await flush();
  await waitFor(() => expect(within(selectedHero()).getByText("900")).toBeInTheDocument());
  expect(hasUnseenUpgrade(stored())).toBe(true);
  view.unmount();

  mockRouter.query = { hero: "luke-skywalker" };
  render(page());
  await flush();
  await waitFor(() => expect(hasUnseenUpgrade(stored())).toBe(false));
  expect(stored().affordable).toEqual({ "luke-skywalker": 1 });
});

it("picking another hero overrides the link", async () => {
  mockRouter.query = { hero: "luke-skywalker" };
  render(page());
  await flush();
  await waitFor(() => expect(within(selectedHero()).getAllByText("60").length).toBeGreaterThan(0));
  fireEvent.click(screen.getByRole("button", { name: /Kenshiro/ }));
  await waitFor(() => expect(within(selectedHero()).getByText("900")).toBeInTheDocument());
});
