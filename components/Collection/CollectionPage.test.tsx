/**
 * /collection (#614) — the page where points turn into pixels. These pin the
 * things that would cost a player something real, or lie to them:
 *
 *  - a GUEST costs zero extra requests and gets the explainer, not a blank page;
 *  - a MIXED deck renders correctly — some cards upgraded, most not, which is
 *    the normal state (design doc §4d) — and the rim is the REAL treatment
 *    component, not a mock;
 *  - spending takes two clicks, buys `current + 1`, and only moves the page
 *    once the server has agreed;
 *  - a 503 reads as "temporarily unavailable" with the ledger still on screen
 *    and every buy disabled — an outage must never read as a wipe;
 *  - a 422 says why, in the server's own numbers;
 *  - the anti-farm disclosure is on the page, verbatim;
 *  - the hero PICKER (#625) states every hero's points and rim without a
 *    click, ranks the ones with points first, and never lists a reflavored
 *    baseline — not even one the API still reports points on.
 */
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import axios from "axios";
import fs from "node:fs";
import path from "node:path";

import { CollectionPage, DISCLOSURE } from "./CollectionPage";
import { API_URL } from "@/lib/account/apiUrl";
import { __resetAccountStoreForTests } from "@/lib/account/useAccount";

jest.mock("next/router", () => ({
  useRouter: () => ({ asPath: "/collection", query: {}, push: jest.fn() }),
}));
// Relative path, not the `@/` alias: SWC rewrites alias *imports*, but leaves a
// `jest.mock()` string argument alone. The navbar drags in the whole site
// chrome (and its own /me probe); this page's content is what's under test.
jest.mock("../Navbar", () => ({ Navbar: () => <nav /> }));
jest.mock("axios");

const mockedAxios = axios as jest.Mocked<typeof axios>;

/** The real frozen snapshot — the same file /pro reads. Kenshiro is an IMAGE
 * deck, so its thumbnails take the `ImageFace` path and need no canvas. */
const snapshot = (deckId: string) =>
  JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), `public/evergreen-decks/${deckId}.json`),
      "utf8",
    ),
  );
const KENSHIRO = snapshot("6rDz");
const LUKE = snapshot("luke-skywalker");

const reply = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

const heroBlock = (over: Record<string, unknown> = {}) => ({
  heroId: "kenshiro",
  earned: 900,
  spent: 200,
  adjusted: 0,
  available: 700,
  // A MIXED deck: one card upgraded, fifteen not.
  cards: [{ key: "feint", tier: 1 }],
  tokenRim: { unlockedTier: 2, enabled: true },
  ...over,
});

const CONSTANTS = {
  cardTierCosts: [50, 150, 400, 1000],
  tokenRimThresholds: [250, 750, 2000, 5000],
};

interface Routes {
  me?: Response;
  cosmetics?: Response;
  spend?: Response;
  tokenRim?: Response;
}

let calls: string[] = [];

const wire = (routes: Routes) => {
  // The second parameter is declared so `mock.calls` types as [url, init] —
  // the request bodies below are the point of several of these tests.
  const fetchMock = jest.fn(async (url: string, _init?: RequestInit) => {
    calls.push(url);
    if (url === `${API_URL}/me`) {
      return routes.me ?? reply(200, { user: { id: "u1", username: "Dean" } });
    }
    if (url === `${API_URL}/me/cosmetics`) {
      return routes.cosmetics ?? reply(200, { heroes: [heroBlock()], constants: CONSTANTS });
    }
    if (url === `${API_URL}/me/cosmetics/spend`) {
      return routes.spend ?? reply(200, { hero: heroBlock() });
    }
    if (url === `${API_URL}/me/cosmetics/token-rim`) return routes.tokenRim ?? reply(200, {});
    throw new Error(`unexpected fetch: ${url}`);
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
};

const renderPage = async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <ChakraProvider>
      <QueryClientProvider client={client}>
        <CollectionPage />
      </QueryClientProvider>
    </ChakraProvider>,
  );
  // Flush the /me probe, the cosmetics read and the snapshot query together.
  await act(async () => {
    await Promise.resolve();
  });
  return view;
};

beforeEach(() => {
  calls = [];
  __resetAccountStoreForTests();
  mockedAxios.get.mockImplementation(async (url: string) => {
    if (url.includes("6rDz")) return { data: KENSHIRO } as never;
    if (url.includes("luke-skywalker")) return { data: LUKE } as never;
    throw new Error("404");
  });
});
afterEach(() => jest.resetAllMocks());

describe("guests", () => {
  it("explains the system, offers sign-in, and asks for nothing else", async () => {
    const fetchMock = wire({ me: reply(401, {}) });
    await renderPage();

    await waitFor(() => expect(screen.getByText(/Sign in with Discord/)).toBeInTheDocument());
    expect(screen.getByText(/Every finished Pro game earns points/)).toBeInTheDocument();
    expect(screen.getByText(/Sign in with Discord/).closest("a")).toHaveAttribute(
      "href",
      expect.stringContaining("return_to=%2Fcollection"),
    );
    // The standing epic rule: a guest costs exactly one request.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([`${API_URL}/me`]);
  });
});

describe("a signed-in player", () => {
  it("shows the hero's points and the anti-farm disclosure", async () => {
    wire({});
    await renderPage();

    await waitFor(() => expect(screen.getByTestId("collection-points")).toBeInTheDocument());
    const points = screen.getByTestId("collection-points");
    expect(within(points).getByText("900")).toBeInTheDocument();
    expect(within(points).getByText("700")).toBeInTheDocument();
    // 900 earned = tier 2 (250, 750); the next rim is antiqued gold at 2000.
    expect(within(points).getByText("Antiqued gold")).toBeInTheDocument();
    expect(within(points).getByText("1100 points to go")).toBeInTheDocument();

    expect(screen.getByTestId("collection-disclosure")).toHaveTextContent(DISCLOSURE);
  });

  it("renders a MIXED deck: the upgraded card wears the real rim, the rest don't", async () => {
    wire({});
    await renderPage();

    await waitFor(() => expect(screen.getByTestId("card-set-feint")).toBeInTheDocument());
    const feint = screen.getByTestId("card-set-feint");
    expect(feint).toHaveAttribute("data-tier", "1");
    // The REAL CardRim component, not a mock: it stamps the tier on its <g>.
    expect(feint.querySelector('[data-cosmetic-rim="bronze"]')).not.toBeNull();
    expect(within(feint).getByText(/^Bronze/)).toBeInTheDocument();

    const plain = screen.getByTestId("card-set-nunchaku");
    expect(plain).toHaveAttribute("data-tier", "0");
    expect(plain.querySelector("[data-cosmetic-rim]")).toBeNull();
    expect(within(plain).getByText("Base")).toBeInTheDocument();
    // Every set in the snapshot has a cell — a mixed deck is not a partial one.
    expect(screen.getAllByTestId(/^card-set-/)).toHaveLength(16);
  });

  it("buys the NEXT tier, behind an in-page confirm, and shows the result", async () => {
    const fetchMock = wire({
      spend: reply(200, {
        hero: heroBlock({
          available: 550,
          cards: [{ key: "feint", tier: 2 }],
        }),
      }),
    });
    await renderPage();

    await waitFor(() => expect(screen.getByTestId("card-set-feint")).toBeInTheDocument());
    const feint = screen.getByTestId("card-set-feint");
    // Tier 1 → the next step costs the second rung of the ladder.
    fireEvent.click(within(feint).getByRole("button", { name: /Upgrade · 150/ }));
    // Nothing is spent on the first click.
    expect(fetchMock).not.toHaveBeenCalledWith(
      `${API_URL}/me/cosmetics/spend`,
      expect.anything(),
    );
    expect(within(feint).getByText(/Spend 150 points for silver\?/)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(within(feint).getByRole("button", { name: "Confirm" }));
    });

    const [, init] = fetchMock.mock.calls.find(
      ([url]) => url === `${API_URL}/me/cosmetics/spend`,
    )!;
    expect(JSON.parse(init?.body as string)).toEqual({
      heroId: "kenshiro",
      cardKey: "feint",
      tier: 2,
    });
    // The server's echo IS the new state — balance and card tier together.
    expect(screen.getByTestId("card-set-feint")).toHaveAttribute("data-tier", "2");
    expect(
      within(screen.getByTestId("card-set-feint")).getByText(/^Silver/),
    ).toBeInTheDocument();
    expect(within(screen.getByTestId("collection-points")).getByText("550")).toBeInTheDocument();
  });

  it("cancels out of the confirm without spending", async () => {
    const fetchMock = wire({});
    await renderPage();

    await waitFor(() => expect(screen.getByTestId("card-set-feint")).toBeInTheDocument());
    const feint = screen.getByTestId("card-set-feint");
    fireEvent.click(within(feint).getByRole("button", { name: /Upgrade/ }));
    fireEvent.click(within(feint).getByRole("button", { name: "Cancel" }));
    expect(within(feint).getByRole("button", { name: /Upgrade/ })).toBeInTheDocument();
    expect(calls).not.toContain(`${API_URL}/me/cosmetics/spend`);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("says why a 422 refused the spend, using the server's numbers", async () => {
    wire({ spend: reply(422, { error: "insufficient_points", cost: 150, available: 20 }) });
    await renderPage();

    await waitFor(() => expect(screen.getByTestId("card-set-feint")).toBeInTheDocument());
    const feint = screen.getByTestId("card-set-feint");
    fireEvent.click(within(feint).getByRole("button", { name: /Upgrade/ }));
    await act(async () => {
      fireEvent.click(within(feint).getByRole("button", { name: "Confirm" }));
    });

    expect(
      await screen.findByText(/that upgrade costs 150 and you have 20/i),
    ).toBeInTheDocument();
    // Nothing moved: the card is still bronze.
    expect(screen.getByTestId("card-set-feint")).toHaveAttribute("data-tier", "1");
  });

  it("offers a card the player can't afford, but won't let them click it", async () => {
    wire({
      cosmetics: reply(200, {
        heroes: [heroBlock({ available: 10, cards: [] })],
        constants: CONSTANTS,
      }),
    });
    await renderPage();

    await waitFor(() => expect(screen.getByTestId("card-set-feint")).toBeInTheDocument());
    const feint = screen.getByTestId("card-set-feint");
    expect(within(feint).getByRole("button", { name: /Upgrade · 50/ })).toBeDisabled();
    expect(within(feint).getByText("40 more to go")).toBeInTheDocument();
  });

  it("switches heroes, and each one keeps its own points and deck", async () => {
    wire({
      cosmetics: reply(200, {
        heroes: [
          heroBlock(),
          heroBlock({
            heroId: "luke-skywalker",
            earned: 300,
            spent: 0,
            // A clawback: available trails earned, which is exactly the case
            // the disclosure warns about.
            adjusted: -50,
            available: 250,
            cards: [],
            tokenRim: { unlockedTier: 1, enabled: false },
          }),
        ],
        constants: CONSTANTS,
      }),
    });
    await renderPage();

    await waitFor(() => expect(screen.getByTestId("card-set-feint")).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByTestId("hero-row-luke-skywalker"));
    });

    // Luke's snapshot is a second query; it lands a tick after the switch.
    await waitFor(() =>
      expect(screen.getByTestId("card-set-quick strike")).toBeInTheDocument(),
    );
    const points = within(screen.getByTestId("collection-points"));
    expect(points.getByText("300")).toBeInTheDocument();
    expect(points.getByText("250")).toBeInTheDocument();
    // Kenshiro's cards — and his bronze Feint — are gone with him. Scoped to
    // the card grid: the picker rows carry rims of their own now (#625).
    expect(screen.queryByTestId("card-set-nunchaku")).toBeNull();
    expect(
      document
        .querySelector('[aria-labelledby="collection-cards-heading"]')
        ?.querySelector("[data-cosmetic-rim]"),
    ).toBeNull();
  });

  it("stops offering upgrades once a card tops the ladder", async () => {
    wire({
      cosmetics: reply(200, {
        heroes: [heroBlock({ cards: [{ key: "feint", tier: 4 }] })],
        constants: CONSTANTS,
      }),
    });
    await renderPage();

    await waitFor(() => expect(screen.getByTestId("card-set-feint")).toBeInTheDocument());
    const feint = screen.getByTestId("card-set-feint");
    expect(within(feint).getByText("Fully upgraded")).toBeInTheDocument();
    expect(within(feint).queryByRole("button")).toBeNull();
    expect(feint.querySelector('[data-cosmetic-rim="iridescent"]')).not.toBeNull();
  });
});

describe("the hero picker (#625)", () => {
  const roster = () =>
    wire({
      cosmetics: reply(200, {
        heroes: [
          heroBlock({ heroId: "batman", earned: 300, spent: 0, available: 300,
            cards: [], tokenRim: { unlockedTier: 1, enabled: true } }),
          heroBlock(),
          // A stale baseline row: the API is folding these into their spice
          // successor, and until it has, the client must not list one.
          heroBlock({ heroId: "thetis", earned: 5000, available: 5000, cards: [],
            tokenRim: { unlockedTier: 4, enabled: true } }),
        ],
        constants: CONSTANTS,
      }),
    });

  it("shows every played hero's points and rim with no interaction at all", async () => {
    roster();
    await renderPage();

    await waitFor(() =>
      expect(screen.getByTestId("collection-hero-picker")).toBeInTheDocument(),
    );
    const kenshiro = screen.getByTestId("hero-row-kenshiro");
    expect(kenshiro).toHaveTextContent("900 earned · 700 available · Silver rim");
    // The REAL FighterTokenRim, not a mock gradient — it stamps its tier.
    expect(
      screen.getByTestId("hero-rim-kenshiro").querySelector('[data-cosmetic-rim="silver"]'),
    ).not.toBeNull();
    expect(screen.getByTestId("hero-row-batman")).toHaveTextContent(
      "300 earned · 300 available · Bronze rim",
    );
    expect(screen.getByTestId("hero-rim-batman")).toHaveAttribute(
      "data-cosmetic-tier",
      "bronze",
    );
  });

  it("ranks by earned points, and the top hero is the one selected", async () => {
    roster();
    await renderPage();

    await waitFor(() =>
      expect(screen.getByTestId("collection-hero-picker")).toBeInTheDocument(),
    );
    const listed = screen
      .getAllByTestId(/^hero-row-/)
      .map((row) => row.getAttribute("data-testid"));
    expect(listed.slice(0, 2)).toEqual(["hero-row-kenshiro", "hero-row-batman"]);
    // Kenshiro (900) leads Batman (300), and leads the page.
    expect(screen.getByTestId("hero-row-kenshiro")).toHaveAttribute("data-selected", "true");
    expect(screen.getByTestId("hero-row-batman")).toHaveAttribute("data-selected", "false");
    expect(screen.getByTestId("card-set-feint")).toBeInTheDocument();
  });

  it("never lists a reflavored baseline, even with 5000 points on it", async () => {
    roster();
    await renderPage();

    await waitFor(() =>
      expect(screen.getByTestId("collection-hero-picker")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("hero-row-thetis")).toBeNull();
    fireEvent.click(screen.getByTestId("collection-more-decks"));
    expect(screen.queryByTestId("hero-row-thetis")).toBeNull();
    // Its successor is listed, under the plain shared name.
    expect(screen.getByTestId("hero-row-thetis-spice")).toHaveTextContent("Thetis");
  });

  it("lists a hero only the API knows about, named from its id", async () => {
    wire({
      cosmetics: reply(200, {
        heroes: [heroBlock(), heroBlock({ heroId: "some-retired-hero", earned: 40, available: 40 })],
        constants: CONSTANTS,
      }),
    });
    await renderPage();

    await waitFor(() =>
      expect(screen.getByTestId("collection-hero-picker")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("hero-row-some-retired-hero")).toHaveTextContent(
      "Some Retired Hero",
    );
  });

  it("keeps the zero-point roster collapsed until asked, then selects from it", async () => {
    roster();
    await renderPage();

    await waitFor(() =>
      expect(screen.getByTestId("collection-hero-picker")).toBeInTheDocument(),
    );
    const more = screen.getByTestId("collection-more-decks");
    expect(more).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("hero-row-luke-skywalker")).toBeNull();

    fireEvent.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");
    await act(async () => {
      fireEvent.click(screen.getByTestId("hero-row-luke-skywalker"));
    });

    // Selecting from the collapsed half behaves exactly like the dropdown did.
    await waitFor(() =>
      expect(screen.getByTestId("card-set-quick strike")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("hero-row-luke-skywalker")).toHaveAttribute(
      "data-selected",
      "true",
    );
    expect(screen.getByTestId("hero-row-kenshiro")).toHaveAttribute("data-selected", "false");
    // Luke is unplayed: earned 0 and available 0, not "unknown".
    expect(within(screen.getByTestId("collection-points")).getAllByText("0")).toHaveLength(2);
  });
});

describe("the token rim", () => {
  it("previews the unlocked rim and saves the display pref", async () => {
    const fetchMock = wire({});
    await renderPage();

    await waitFor(() => expect(screen.getByTestId("token-preview")).toBeInTheDocument());
    // 2 unlocked and shown → the real FighterTokenRim, wearing silver.
    expect(screen.getByTestId("token-preview")).toHaveAttribute("data-cosmetic-tier", "silver");
    expect(screen.getByText("Silver rim unlocked")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByLabelText("Show my rim in games"));
    });

    const [, init] = fetchMock.mock.calls.find(
      ([url]) => url === `${API_URL}/me/cosmetics/token-rim`,
    )!;
    expect(JSON.parse(init?.body as string)).toEqual({
      heroId: "kenshiro",
      enabled: false,
    });
    // Hidden now — the preview tells the truth about what the table sees.
    expect(screen.getByTestId("token-preview")).toHaveAttribute("data-cosmetic-tier", "none");
    expect(screen.getByText(/Unlocked but hidden/)).toBeInTheDocument();
  });

  it("rolls the switch back when the write fails", async () => {
    wire({ tokenRim: reply(503, {}) });
    await renderPage();

    await waitFor(() => expect(screen.getByTestId("token-preview")).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Show my rim in games"));
    });
    expect(screen.getByLabelText("Show my rim in games")).toBeChecked();
    expect(await screen.findByText(/Couldn't save that right now/)).toBeInTheDocument();
  });

  it("won't offer a rim nobody has unlocked", async () => {
    wire({
      cosmetics: reply(200, {
        heroes: [heroBlock({ earned: 10, available: 10, tokenRim: { unlockedTier: 0, enabled: false } })],
        constants: CONSTANTS,
      }),
    });
    await renderPage();

    await waitFor(() => expect(screen.getByTestId("token-preview")).toBeInTheDocument());
    expect(screen.getByText("No rim unlocked yet")).toBeInTheDocument();
    expect(screen.getByLabelText("Show my rim in games")).toBeDisabled();
  });
});

describe("when stats are down", () => {
  const degraded = () =>
    wire({
      cosmetics: reply(503, {
        error: "upstream_unavailable",
        heroes: [
          heroBlock({
            earned: null,
            available: null,
            tokenRim: { unlockedTier: null, enabled: true },
          }),
        ],
        constants: CONSTANTS,
      }),
    });

  it("says so, keeps the upgrades on screen, and disables every buy", async () => {
    degraded();
    await renderPage();

    await waitFor(() => expect(screen.getByTestId("collection-degraded")).toBeInTheDocument());
    expect(screen.getByTestId("collection-degraded")).toHaveTextContent(
      /temporarily unavailable/i,
    );
    // The ledger the 503 carried is still rendered — an outage is not a wipe.
    expect(screen.getByTestId("card-set-feint")).toHaveAttribute("data-tier", "1");
    expect(
      screen.getByTestId("card-set-feint").querySelector('[data-cosmetic-rim="bronze"]'),
    ).not.toBeNull();
    // ...but nothing is priceable, so nothing is buyable.
    for (const button of screen.getAllByRole("button", { name: /Upgrade/ })) {
      expect(button).toBeDisabled();
    }
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    // The picker keeps rendering: names and rows, with the numbers it honestly
    // cannot know shown as unknown rather than as zero.
    expect(screen.getByTestId("hero-row-kenshiro")).toHaveTextContent(
      "— earned · — available · Rim unavailable",
    );
    expect(screen.getByTestId("hero-row-kenshiro")).toHaveAttribute("data-selected", "true");
  });

  it("still lets a player hide their rim — that write needs no telemetry", async () => {
    const fetchMock = degraded();
    await renderPage();

    await waitFor(() => expect(screen.getByTestId("token-preview")).toBeInTheDocument());
    const toggle = screen.getByLabelText("Show my rim in games");
    expect(toggle).toBeEnabled();
    await act(async () => {
      fireEvent.click(toggle);
    });
    expect(
      fetchMock.mock.calls.some(([url]) => url === `${API_URL}/me/cosmetics/token-rim`),
    ).toBe(true);
  });
});
