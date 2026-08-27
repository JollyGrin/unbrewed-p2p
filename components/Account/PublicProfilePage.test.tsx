/**
 * /stats?u= (#590) — a public profile, driven through the real page so the
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
import { render, screen, waitFor } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";

import { PublicProfilePage } from "./PublicProfilePage";
import { API_URL } from "@/lib/account/apiUrl";
import { __resetAccountStoreForTests } from "@/lib/account/useAccount";

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
    throw new TypeError(`unexpected fetch: ${url}`);
  });
};

const renderPage = () =>
  render(
    <ChakraProvider>
      <PublicProfilePage />
    </ChakraProvider>,
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

  it("renders the whole profile with no sign-in", async () => {
    renderPage();

    expect(await screen.findByText("Emyrk")).toBeInTheDocument();
    // Level bar, badge case, record and match history all present.
    expect(screen.getByTestId("account-level-number")).toHaveTextContent("5");
    const chip = screen.getByTestId("account-badge-chip");
    expect(chip).toHaveTextContent("First Blood");
    expect(chip).toHaveTextContent("Veteran");
    expect(screen.getByRole("heading", { name: "Record" })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getAllByTestId("account-game-row")).toHaveLength(1),
    );
    expect(screen.getByTestId("stats-caveat")).toBeInTheDocument();
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

  it("offers no way to change the badge being worn", async () => {
    renderPage();
    await screen.findByText("Emyrk");

    for (const tile of screen.getAllByTestId("account-badge")) {
      expect(tile.tagName).not.toBe("BUTTON");
    }
    // And no worn strip: ordering is only meaningful where it can be changed.
    expect(screen.queryByTestId("account-worn-strip")).not.toBeInTheDocument();
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
