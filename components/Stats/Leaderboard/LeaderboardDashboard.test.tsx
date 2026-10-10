/**
 * /leaderboard dashboard (#936), mounted whole against a fake api.
 *
 * What these pin:
 *  - with the full contract (the fixtures as wire bodies) every section draws:
 *    podium, 9-row chase pack that expands in place, YOU on the viewer's row,
 *    table talk, 12 hero tiles, the match grid and its side panels;
 *  - against today's prod shape (no new fields, month ignored, /community 404)
 *    the month board falls back to all-time with a note, and the community
 *    cards render NOTHING — no empty headings;
 *  - the window lives in the URL: the toggle shallow-replaces `?window=all`,
 *    and `?window=all` asks both routes for `window=all`;
 *  - a dead api is one calm sentence, and the caveat is always there.
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { STATS_CAVEAT } from "@/components/Account/StatsCaveat";
import { __resetAccountStoreForTests } from "@/lib/account/useAccount";
import { fixtureCommunity, fixtureLeaderboard } from "@/lib/stats/fixtures";
import type { StatsWindow } from "@/lib/stats/types";

import { LeaderboardDashboard } from "./LeaderboardDashboard";

const router = {
  isReady: true,
  pathname: "/leaderboard",
  asPath: "/leaderboard",
  query: {} as Record<string, string>,
  replace: jest.fn(async () => true),
  push: jest.fn(),
};
jest.mock("next/router", () => ({ useRouter: () => router }));
jest.mock("../../Navbar", () => ({ Navbar: () => <nav /> }));

const reply = (status: number, body?: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

/** Today's prod row: none of §2c's fields. */
const PROD_BOARD = {
  generatedAt: "2026-09-27T12:00:00.000Z",
  players: Array.from({ length: 5 }, (_, i) => ({
    rank: i + 1,
    username: `player${i + 1}`,
    avatarUrl: null,
    level: 10 - i,
    xp: 5000 - i * 700,
    selectedBadge: null,
    selectedBadges: [],
    gamesPlayed: 100 - i * 10,
    wins: 60 - i * 5,
  })),
};

let fetchMock: jest.Mock;
let calls: string[];

const install = (opts: { full?: boolean; down?: boolean; me?: string }) => {
  calls = [];
  fetchMock = jest.fn(async (url: string) => {
    calls.push(url);
    if (url.endsWith("/me")) return opts.me ? reply(200, { user: { id: "u1", username: opts.me } }) : reply(401);
    if (opts.down) throw new TypeError("offline");
    const window = (new URL(url, "http://x").searchParams.get("window") ?? "all") as StatsWindow;
    if (url.includes("/leaderboard")) return reply(200, opts.full ? fixtureLeaderboard(200, window) : PROD_BOARD);
    if (url.includes("/community")) return opts.full ? reply(200, fixtureCommunity(window)) : reply(404);
    return reply(404); // deck snapshots → initials tokens
  });
  global.fetch = fetchMock as unknown as typeof fetch;
};

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ChakraProvider>
        <LeaderboardDashboard />
      </ChakraProvider>
    </QueryClientProvider>,
  );

beforeEach(() => {
  __resetAccountStoreForTests();
  router.query = {};
  router.replace.mockClear();
  delete process.env.NEXT_PUBLIC_STATS_FIXTURES;
});

describe("LeaderboardDashboard", () => {
  it("draws every section from the full contract (this month)", async () => {
    install({ full: true, me: "Dunmore" });
    renderPage();

    const podium = await screen.findByTestId("podium");
    expect(within(podium).getAllByTestId("podium-card").map((c) => c.getAttribute("aria-label"))).toEqual([
      "#1 TinCanTom",
      "#2 mossback",
      "#3 lanternjaw",
    ]);
    // Month wins on the podium, not all-time.
    expect(within(podium).getByText("64")).toBeInTheDocument();

    const rows = screen.getAllByTestId("chase-row");
    expect(rows).toHaveLength(9);
    expect(rows[0]).toHaveAttribute("href", "/stats?u=quietharbor");
    expect(rows[0]).toHaveTextContent("41 wins this month · 3 behind #3");
    // The signed-in viewer's row is tagged once the account probe lands.
    await waitFor(() =>
      expect(screen.getAllByTestId("chase-row").find((r) => r.getAttribute("data-self") === "true")).toHaveTextContent(
        "DunmoreYOU",
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: /Show all 13 players/ }));
    expect(screen.getAllByTestId("chase-row")).toHaveLength(10);

    expect(screen.getByText("Games this month")).toBeInTheDocument();
    expect(screen.getByText("214")).toBeInTheDocument();
    expect(screen.getByText("This month's table talk")).toBeInTheDocument();
    expect(screen.getByText("Humans beat the expert bot in 70% of games this month.")).toBeInTheDocument();

    const tiles = screen.getAllByTestId("hero-tile");
    expect(tiles).toHaveLength(12);
    expect(tiles[0]).toHaveAttribute("href", "/heroes?h=the-mandalorian");
    expect(within(tiles[9]).getByText("Unclaimed")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All 34 heroes" })).toHaveAttribute("href", "/heroes");

    expect(screen.getByTestId("match-grid")).toBeInTheDocument();
    expect(screen.getByText("The Mandalorian vs Boba Fett")).toBeInTheDocument();
    expect(screen.getByText("Baba Yaga vs Kenshiro")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Play this matchup" })).toHaveAttribute("href", "/pro");
    fireEvent.click(screen.getByRole("button", { name: "Win rate" }));
    expect(screen.getByRole("button", { name: "Win rate" })).toHaveAttribute("aria-pressed", "true");

    expect(screen.getByText(STATS_CAVEAT)).toBeInTheDocument();
  });

  it("degrades against today's prod api: all-time fallback, no community cards", async () => {
    install({});
    renderPage();

    expect(await screen.findByText(/Monthly standings aren.t available yet/)).toBeInTheDocument();
    expect(screen.getAllByTestId("podium-card")).toHaveLength(3);
    const rows = screen.getAllByTestId("chase-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("2,900 XP · 700 behind #3");
    // Fell back: one month ask, one all-time ask.
    expect(calls.filter((u) => u.includes("/leaderboard"))).toEqual([
      expect.stringContaining("window=month"),
      expect.stringContaining("window=all"),
    ]);

    // Players ranked from the short board; the community tiles/cards are absent.
    expect(screen.getByText("Players ranked")).toBeInTheDocument();
    for (const gone of ["Games this month", "Heroes in play", "Games played", "Match grid", "This month's table talk"]) {
      expect(screen.queryByText(gone)).not.toBeInTheDocument();
    }
    expect(screen.queryByTestId("hero-tile")).not.toBeInTheDocument();
    expect(screen.getByText(STATS_CAVEAT)).toBeInTheDocument();
  });

  it("keeps the window in the URL", async () => {
    install({ full: true });
    renderPage();
    await screen.findByTestId("podium");
    fireEvent.click(screen.getByRole("button", { name: "All time" }));
    expect(router.replace).toHaveBeenCalledWith(
      { pathname: "/leaderboard", query: { window: "all" } },
      undefined,
      { shallow: true, scroll: false },
    );
  });

  it("?window=all asks both routes for all time and says so", async () => {
    router.query = { window: "all" };
    install({ full: true });
    renderPage();
    await screen.findByTestId("podium");
    expect(calls.filter((u) => /leaderboard|community/.test(u)).every((u) => u.includes("window=all"))).toBe(true);
    expect(screen.getByRole("button", { name: "All time" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Games all time")).toBeInTheDocument();
    expect(screen.getByText("All-time table talk")).toBeInTheDocument();
    expect(screen.getAllByTestId("chase-row")[0]).toHaveTextContent("13,480 XP · 640 behind #3");
  });

  it("a dead api is one calm sentence", async () => {
    install({ down: true });
    renderPage();
    expect(await screen.findByText(/The leaderboard is unavailable right now/)).toBeInTheDocument();
    expect(screen.queryByTestId("podium")).not.toBeInTheDocument();
    expect(screen.queryByText("The chase pack")).not.toBeInTheDocument();
    expect(screen.getByText(STATS_CAVEAT)).toBeInTheDocument();
  });
});
