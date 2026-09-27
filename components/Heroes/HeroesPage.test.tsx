/**
 * /heroes and /heroes?h= (#938), driven through the real page with a fake
 * fetch: the not-found notice, the prod-today degradation (every new route
 * 404s → sections vanish, nothing crashes), a full ladder for a signed-in
 * viewer, a never-played hero's empty states, the window in the request, and
 * the index with and without community numbers.
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { API_URL } from "@/lib/account/apiUrl";
import { __resetAccountStoreForTests } from "@/lib/account/useAccount";
import { ROSTER_SIZE } from "@/lib/stats/roster";

import { HeroesPage } from "./HeroesPage";

let query: Record<string, string> = {};
jest.mock("next/router", () => ({
  useRouter: () => ({ asPath: "/heroes", query, isReady: true, push: jest.fn() }),
}));
jest.mock("../Navbar", () => ({ Navbar: () => <nav /> }));

const reply = (status: number, body: unknown = {}) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

type Routes = Record<string, () => Response>;
let routes: Routes;
let calls: string[];

beforeEach(() => {
  __resetAccountStoreForTests();
  delete process.env.NEXT_PUBLIC_STATS_FIXTURES;
  calls = [];
  routes = {};
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const path = url.startsWith(API_URL) ? url.slice(API_URL.length) : url;
    const key = Object.keys(routes).find((prefix) => path.startsWith(prefix));
    if (key) return routes[key]();
    if (path === "/me") return reply(401);
    return reply(404);
  }) as unknown as typeof fetch;
});

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ChakraProvider>
        <HeroesPage />
      </ChakraProvider>
    </QueryClientProvider>,
  );

const pilot = (username: string, wins: number, games: number) => ({
  username,
  avatarUrl: null,
  wins,
  games,
  draws: 0,
});

const HERO = {
  heroId: "the-mandalorian",
  heroName: "The Mandalorian",
  window: "month",
  windowStart: "2026-09-01T00:00:00.000Z",
  generatedAt: "2026-09-27T10:00:00.000Z",
  games: 212,
  wins: 114,
  draws: 2,
  totalHumanSeatGames: 1482,
  pilotCount: 61,
  pilots: [pilot("TinCanTom", 71, 118), pilot("Dunmore", 19, 38), pilot("JollyGrin", 15, 24)],
  crown: pilot("TinCanTom", 71, 118),
  matchups: [
    ...Array.from({ length: 13 }, (_, i) => ({
      opponentHeroId: ["appa", "batman", "thrall", "kenshiro", "king-kong", "r2-d2", "skull-kid", "triceratops", "darth-maul", "darth-vader", "boba-fett", "luke-skywalker", "nancy-drew"][i],
      opponentHeroName: null,
      games: 10,
      wins: i % 10,
      draws: 0,
    })),
    { opponentHeroId: "baba-yaga", opponentHeroName: null, games: 2, wins: 2, draws: 0 },
  ],
  byOpponentKind: { human: 100, hardExpert: 87, casual: 25 },
};

describe("/heroes?h=", () => {
  it("names a hero that isn't on the roster without asking the api", async () => {
    query = { h: "thetis" };
    renderPage();
    expect(screen.getByText("No hero by that name")).toBeInTheDocument();
    expect(calls.some((url) => url.includes("/heroes?"))).toBe(false);
  });

  it("degrades to the name and token against today's prod api", async () => {
    query = { h: "the-mandalorian" };
    renderPage();
    expect(await screen.findByTestId("hero-unavailable")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "The Mandalorian" })).toBeInTheDocument();
    expect(screen.queryByTestId("crown-card")).not.toBeInTheDocument();
    expect(screen.queryByTestId("band-tile")).not.toBeInTheDocument();
    expect(screen.queryByText("Top pilots")).not.toBeInTheDocument();
    expect(screen.queryByText("Matchups")).not.toBeInTheDocument();
    expect(screen.queryByTestId("across-the-table")).not.toBeInTheDocument();
    expect(screen.queryByTestId("your-hero-rank")).not.toBeInTheDocument();
    expect(screen.getByTestId("stats-caveat")).toBeInTheDocument();
    // Default window is this month.
    expect(calls).toContain(`${API_URL}/heroes?h=the-mandalorian&window=month`);
  });

  it("renders the full ladder for a signed-in viewer", async () => {
    query = { h: "the-mandalorian", window: "all" };
    routes = {
      "/heroes?": () => reply(200, { ...HERO, window: "all" }),
      "/community?window=month": () =>
        reply(200, {
          window: "month",
          heroes: [
            { heroId: "the-mandalorian", heroName: null, games: 212, wins: 114, draws: 0, crown: null },
            { heroId: "appa", heroName: null, games: 90, wins: 40, draws: 0, crown: null },
          ],
        }),
      "/me": () => reply(200, { user: { id: "u1", username: "jollygrin", avatarUrl: null } }),
      "/players?u=jollygrin": () =>
        reply(200, {
          user: { username: "JollyGrin", avatarUrl: null },
          stats: {
            totalGames: 30,
            wins: 15,
            losses: 15,
            draws: 0,
            byHero: [{ heroId: "the-mandalorian", heroName: null, games: 24, wins: 15 }],
          },
        }),
    };
    renderPage();

    expect(await screen.findByTestId("crown-card")).toHaveTextContent("TinCanTom71 wins in 118 games.");
    expect(calls).toContain(`${API_URL}/heroes?h=the-mandalorian&window=all`);
    expect(screen.getByText("Hero ladder · most played this month")).toBeInTheDocument();
    const tiles = screen.getAllByTestId("band-tile").map((el) => el.textContent);
    expect(tiles).toEqual(["212games", "54%win rate", "14%of all games", "61pilots"]);

    expect(await screen.findByTestId("your-hero-rank")).toHaveTextContent(
      "24 games as The Mandalorian. One more game makes Silver.",
    );
    expect(screen.getByTestId("play-hero")).toHaveAttribute("href", "/pro");

    const pilots = screen.getAllByTestId("pilot-row");
    expect(pilots).toHaveLength(3);
    expect(pilots[2]).toHaveTextContent("YOU");
    expect(pilots[0]).toHaveAttribute("href", "/stats?u=TinCanTom");
    expect(screen.getByTestId("pilot-gap")).toHaveTextContent("You are 4 wins behind Dunmore for 2nd.");

    // 13 opponents with ≥3 games: the collapsed view is the 6 best + a
    // divider + the 6 worst, still 12 rows, best first. baba-yaga's 2 games
    // (issue #949: no longer dropped) fold into the muted summary line.
    let rows = screen.getAllByTestId("matchup-row");
    expect(rows).toHaveLength(12);
    expect(rows[0]).toHaveAttribute("title", "90% over 10 games");
    expect(screen.getByTestId("matchup-divider")).toBeInTheDocument();
    expect(screen.getByTestId("matchup-unrated-summary")).toHaveTextContent("1 more hero faced once or twice");
    expect(screen.getByText(/Counts every game with The Mandalorian at the table, bot seats included\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show all 14" }));
    rows = screen.getAllByTestId("matchup-row");
    expect(rows).toHaveLength(13);
    expect(screen.queryByTestId("matchup-divider")).not.toBeInTheDocument();
    expect(screen.queryByTestId("matchup-unrated-summary")).not.toBeInTheDocument();
    const unratedRows = screen.getAllByTestId("matchup-row-unrated");
    expect(unratedRows).toHaveLength(1);
    expect(unratedRows[0]).toHaveTextContent("2–0");

    expect(screen.getByTestId("across-the-table")).toHaveTextContent("Who The Mandalorian was played against all time.");
    expect(screen.getByTestId("window-all")).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("window-month")).toHaveAttribute("href", "/heroes?h=the-mandalorian");
  });

  it("gives a never-played hero inviting empty states, not an error", async () => {
    query = { h: "nancy-drew" };
    routes = {
      "/heroes?": () =>
        reply(200, {
          heroId: "nancy-drew",
          heroName: null,
          window: "month",
          games: 0,
          wins: 0,
          draws: 0,
          totalHumanSeatGames: 1482,
          pilotCount: 0,
          pilots: [],
          crown: null,
          matchups: [],
          byOpponentKind: { human: 0, hardExpert: 0, casual: 0 },
        }),
    };
    renderPage();
    expect(await screen.findByTestId("crown-card")).toHaveTextContent(
      "Unclaimed. Win a game with Nancy Drew to take it.",
    );
    expect(screen.getByTestId("pilots-empty")).toHaveTextContent("Nobody has played Nancy Drew this month.");
    expect(screen.queryByText("Matchups")).not.toBeInTheDocument();
    expect(screen.queryByTestId("across-the-table")).not.toBeInTheDocument();
    expect(screen.queryByText(/most played/)).not.toBeInTheDocument();
    // #944: the month window nudge, linking to the all-time page.
    expect(screen.getByTestId("empty-month-nudge")).toHaveTextContent(
      "No one played Nancy Drew this month. See all time",
    );
    expect(screen.getByTestId("empty-month-nudge")).toHaveAttribute("href", "/heroes?h=nancy-drew&window=all");
  });

  it("has no empty-month nudge once the hero has games, or on the all-time window", async () => {
    query = { h: "the-mandalorian", window: "all" };
    routes = { "/heroes?": () => reply(200, { ...HERO, window: "all" }) };
    renderPage();
    await screen.findByTestId("crown-card");
    expect(screen.queryByTestId("empty-month-nudge")).not.toBeInTheDocument();
  });
});

describe("/heroes (index)", () => {
  it("lists the bare roster when /community is missing", async () => {
    query = {};
    renderPage();
    expect(await screen.findByTestId("community-unavailable")).toBeInTheDocument();
    const cards = screen.getAllByTestId("hero-card");
    expect(cards).toHaveLength(ROSTER_SIZE);
    expect(cards[0]).toHaveAttribute("href", "/heroes?h=appa");
    expect(screen.queryByText("Unclaimed")).not.toBeInTheDocument();
  });

  it("sorts by games and dims unplayed heroes", async () => {
    query = { window: "all" };
    routes = {
      "/community?window=all": () =>
        reply(200, {
          window: "all",
          heroes: [
            { heroId: "thrall", heroName: null, games: 40, wins: 20, draws: 0, crown: { username: "mossback", avatarUrl: null, wins: 9, games: 12 } },
            { heroId: "appa", heroName: null, games: 12, wins: 3, draws: 0, crown: null },
          ],
        }),
    };
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId("hero-card")[0]).toHaveAttribute("data-hero", "thrall"));
    const cards = screen.getAllByTestId("hero-card");
    expect(cards[0]).toHaveTextContent("40 games · 50% win rate");
    expect(cards[0]).toHaveTextContent("mossback");
    expect(cards[0]).toHaveAttribute("href", "/heroes?h=thrall&window=all");
    expect(cards[1]).toHaveTextContent("Unclaimed");
    expect(cards[2]).toHaveAttribute("data-played", "false");
    expect(cards[2]).toHaveTextContent("Not played yet");
  });
});
