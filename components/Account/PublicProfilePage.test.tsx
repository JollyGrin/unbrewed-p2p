/**
 * /stats?u= (#590, dashboard #937) — a public profile, driven through the real page so the
 * query-string reading and every empty state are exercised where they live.
 *
 * What these pin:
 *  - a SIGNED-OUT visitor sees somebody's whole profile, and the page never
 *    touches a `/me/*` route to do it (the public routes take no cookie);
 *  - an unknown username is a calm sentence, not a crash and not an error
 *    surface — it is what a typo in the address bar gets;
 *  - a dead API and a missing `?u=` each read as their own quiet state;
 *  - the router's static-export reality: `?u=` isn't there on the first render,
 *    and the page must not flash not-found while waiting for it.
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { PublicProfilePage } from "./PublicProfilePage";
import { API_URL } from "@/lib/account/apiUrl";
import { __resetAccountStoreForTests } from "@/lib/account/useAccount";
import { fixturePlayer } from "@/lib/stats/fixtures";

let query: Record<string, string> = {};
let isReady = true;
jest.mock("next/router", () => ({
  useRouter: () => ({ asPath: "/stats", query, isReady, push: jest.fn() }),
}));
jest.mock("../Navbar", () => ({ Navbar: () => <nav /> }));
jest.mock("../../lib/pro/replayStore", () => ({ listReplays: () => [] }));

const reply = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

const PROFILE = {
  user: { username: "Emyrk", avatarUrl: null },
  level: 5,
  xp: 1800,
  xpForNext: 2100,
  // #718: worn is an ordered list, and `selectedBadge` rides along as slot 1
  // for a release. The header shows the whole cluster.
  selectedBadge: "first-win",
  selectedBadges: ["first-win", "veteran"],
  badges: [
    {
      id: "first-win",
      name: "First Blood",
      blurb: "Won your first game.",
      unlocked: true,
      unlockedWhy: "Win a game (1/1)",
    },
    {
      id: "veteran",
      name: "Veteran",
      blurb: "A hundred games deep.",
      unlocked: true,
      unlockedWhy: "Play 100 games (123/100)",
    },
  ],
  stats: {
    totalGames: 12,
    wins: 7,
    losses: 4,
    draws: 1,
    byHero: [{ heroId: "thrall", heroName: "Thrall", games: 12, wins: 7 }],
  },
};

const GAME = {
  id: "g1",
  endedAt: "2026-08-05T12:00:00.000Z",
  map: "mended-drum",
  turns: 14,
  durationSeconds: 733,
  endCondition: "hp_zero",
  draw: false,
  you: { heroId: "thrall", heroName: "Thrall", won: true, finalHealth: 4 },
  opponents: [
    { heroId: "king-kong", heroName: "King Kong", pilot: "human", botDifficulty: null },
  ],
};

let fetchMock: jest.Mock;

const install = (
  handler: (url: string, init?: RequestInit) => Response | undefined,
) => {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const answer = handler(url, init);
    if (answer) return answer;
    // Hero token snapshots: no art in tests → initials discs.
    if (url.startsWith("/evergreen-decks/")) return reply(404, {});
    throw new TypeError(`unexpected fetch: ${url}`);
  });
};

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ChakraProvider>
        <PublicProfilePage />
      </ChakraProvider>
    </QueryClientProvider>,
  );

beforeEach(() => {
  __resetAccountStoreForTests();
  query = { u: "Emyrk" };
  isReady = true;
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("/stats?u= — a player who exists", () => {
  beforeEach(() => {
    install((url) => {
      if (url.includes("/players/games")) return reply(200, { games: [GAME], nextBefore: null });
      if (url.includes("/players?u=")) return reply(200, PROFILE);
      // The navbar chip's `/me` probe would normally answer here; this page
      // renders a stubbed navbar, so nothing should ask.
      if (url.endsWith("/me")) return reply(401, {});
      return undefined;
    });
  });

  it("renders what today's api sends, and hides every section it doesn't", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { level: 1, name: "Emyrk" })).toBeInTheDocument();
    // Header: level bar and worn badges, but no rank and no Next up card.
    expect(screen.getByTestId("player-level")).toHaveTextContent("Level 5");
    expect(screen.getByTestId("worn-badges")).toHaveTextContent("First Blood");
    expect(screen.getByTestId("worn-badges")).toHaveTextContent("Veteran");
    expect(screen.queryByTestId("player-rank")).toBeNull();
    expect(screen.queryByTestId("next-up")).toBeNull();
    // Only the three tiles an older payload can fill.
    expect(screen.getAllByTestId("stat-tile").map((t) => t.textContent)).toEqual([
      expect.stringContaining("Games12"),
      expect.stringContaining("Win rate58%"),
      expect.stringContaining("Record7–4–1"),
    ]);
    // Sections with no data: nothing at all, not an empty header.
    for (const name of ["Table time", "Recent form", "Match grid", "Who they play"]) {
      expect(screen.queryByRole("heading", { name })).toBeNull();
    }
    // Roster and badges still render from the fields prod has.
    expect(screen.getByTestId("roster-played")).toHaveTextContent("1 of 34 played");
    expect(screen.getByTestId("main-hero")).toHaveTextContent("Thrall");
    expect(screen.queryByTestId("main-hero-crown")).toBeNull();
    expect(screen.queryByTestId("roster-generalist")).toBeNull();
    expect(screen.getByRole("heading", { name: "Badge case" })).toBeInTheDocument();
    expect(screen.queryByTestId("badge-chase")).toBeNull();
    await waitFor(() => expect(screen.getAllByTestId("player-game-row")).toHaveLength(1));
    expect(screen.getByTestId("stats-caveat")).toBeInTheDocument();
    // An api without xpPerWin predates /heroes: no crown lookup, so no 404.
    expect(fetchMock.mock.calls.filter(([url]: [string]) => url.includes("/heroes"))).toHaveLength(0);
  });

  it("asks the public routes without credentials", async () => {
    renderPage();
    await screen.findByText("Emyrk");

    const profileCall = fetchMock.mock.calls.find(([url]: [string]) =>
      url.includes("/players?u="),
    );
    expect(profileCall[0]).toBe(`${API_URL}/players?u=Emyrk`);
    expect(profileCall[1]).toMatchObject({ credentials: "omit" });
    // Nothing self-scoped: a visitor's own session is irrelevant here.
    expect(
      fetchMock.mock.calls.filter(([url]: [string]) => url.includes("/me/")),
    ).toHaveLength(0);
  });

  it("offers no way to change the badges being worn", async () => {
    renderPage();
    await screen.findByRole("heading", { level: 1, name: "Emyrk" });

    // The /account grid, read-only (#948): tiles are plain divs, never buttons.
    expect(screen.getAllByTestId("account-badge").every((b) => b.tagName === "DIV")).toBe(true);
    expect(screen.queryByRole("button", { name: /wear|select/i })).toBeNull();
  });
});

describe("/stats?u= — the full contract payload", () => {
  const FULL = fixturePlayer("lanternjaw");

  beforeEach(() => {
    query = { u: "lanternjaw" };
    install((url) => {
      if (url.includes("/players/games")) return reply(200, { games: [GAME], nextBefore: "c1" });
      if (url.includes("/players?u=")) return reply(200, FULL);
      if (url.includes("/heroes?h=specter-knight"))
        return reply(200, {
          heroId: "specter-knight",
          crown: { username: "lanternjaw", avatarUrl: null, games: 90, wins: 52, draws: 0 },
        });
      return undefined;
    });
  });

  it("renders every section of the dashboard", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { level: 1, name: "lanternjaw" })).toBeInTheDocument();
    expect(screen.getByTestId("player-rank")).toHaveTextContent("Rank 4 of 214");
    expect(screen.getByTestId("next-up")).toHaveTextContent("640 XP behind quietharbor for the podium");
    expect(screen.getByTestId("next-up")).toHaveTextContent(
      "That is 16 wins against humans, or 20 against the expert bot.",
    );
    expect(screen.getAllByTestId("stat-tile")).toHaveLength(6);
    for (const name of ["Table time", "Recent form", "Roster", "Match grid", "Who they play", "Badge case", "Games"]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
    expect(screen.getByTestId("table-time-footer")).toHaveTextContent(/Busiest day: 14 games on/);
    expect(screen.getByTestId("roster-generalist")).toHaveTextContent("to Generalist badge");
    expect(screen.getByTestId("nemesis")).toHaveTextContent(
      "Nemesis: Boba Fett. 3 and 8 against Boba Fett with Specter Knight.",
    );
    expect(await screen.findByTestId("main-hero-crown")).toHaveTextContent(
      "Holds the Specter Knight crown with 52 wins.",
    );
    expect(screen.getAllByTestId("badge-chase").length).toBeGreaterThan(0);
    expect(await screen.findByRole("button", { name: "Older games" })).toBeInTheDocument();
    // Every roster slot links to its hero page.
    const links = screen.getByTestId("roster-grid").querySelectorAll("a");
    expect(links).toHaveLength(34);
    expect(links[0].getAttribute("href")).toMatch(/^\/heroes\?h=/);
  });

  it("caps the games list at 8 rows until Older games reveals the rest (#944)", async () => {
    const games = Array.from({ length: 10 }, (_, i) => ({ ...GAME, id: `g${i}` }));
    install((url) => {
      if (url.includes("/players/games")) return reply(200, { games, nextBefore: null });
      if (url.includes("/players?u=")) return reply(200, FULL);
      if (url.includes("/heroes?h=")) return reply(200, { heroId: "specter-knight", crown: null });
      return undefined;
    });

    renderPage();
    await screen.findByRole("heading", { level: 1, name: "lanternjaw" });

    await waitFor(() => expect(screen.getAllByTestId("player-game-row")).toHaveLength(8));
    fireEvent.click(screen.getByRole("button", { name: "Older games" }));
    await waitFor(() => expect(screen.getAllByTestId("player-game-row")).toHaveLength(10));
    // All 10 loaded rows are visible and there is no further page: no button.
    expect(screen.queryByRole("button", { name: "Older games" })).toBeNull();
  });

  it("shows no crown line when somebody else holds it", async () => {
    install((url) => {
      if (url.includes("/players/games")) return reply(200, { games: [], nextBefore: null });
      if (url.includes("/players?u=")) return reply(200, FULL);
      if (url.includes("/heroes?h="))
        return reply(200, { heroId: "specter-knight", crown: { username: "mossback", avatarUrl: null, games: 9, wins: 99, draws: 0 } });
      return undefined;
    });
    renderPage();
    await screen.findByTestId("main-hero");
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]: [string]) => url.includes("/heroes?h="))).toBe(true),
    );
    expect(screen.queryByTestId("main-hero-crown")).toBeNull();
    expect(await screen.findByText("No finished Pro games on record yet.")).toBeInTheDocument();
  });
});

describe("/stats?u= — the states that aren't a profile", () => {
  it("says nobody has that name on a 404, and doesn't crash", async () => {
    query = { u: "ghost" };
    install((url) =>
      url.includes("/players?u=") ? reply(404, { error: "not_found" }) : undefined,
    );

    renderPage();

    expect(await screen.findByText(/No player by that name/i)).toBeInTheDocument();
    expect(screen.getByText("ghost")).toBeInTheDocument();
    // The history route is never asked about a player who doesn't exist.
    expect(
      fetchMock.mock.calls.filter(([url]: [string]) => url.includes("/players/games")),
    ).toHaveLength(0);
  });

  it("says the profiles are unavailable when the API is unreachable", async () => {
    install(() => {
      throw new TypeError("Failed to fetch");
    });

    renderPage();

    expect(
      await screen.findByText(/Player profiles are unavailable right now/i),
    ).toBeInTheDocument();
  });

  it("asks for a username when the address has none", async () => {
    query = {};

    renderPage();

    expect(await screen.findByText(/Add a player to the address/i)).toBeInTheDocument();
    // No profile is asked for without a name. The one call is the shared `/me`
    // probe the navbar chip makes on every page anyway (it only decides whether
    // to mark "this is you"), and the store dedupes it with the chip's.
    expect(
      fetchMock.mock.calls.filter(([url]: [string]) => url.includes("/players")),
    ).toHaveLength(0);
  });

  it("waits for the router rather than flashing not-found", () => {
    // The first client render of a static export: `query` is empty and the
    // router says so. Reading `?u=` here would show the wrong page for a beat.
    query = {};
    isReady = false;

    renderPage();

    expect(screen.queryByText(/Add a player to the address/i)).toBeNull();
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });
});
