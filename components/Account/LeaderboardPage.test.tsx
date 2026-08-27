/**
 * /leaderboard (#590) — the public board.
 *
 * What these pin:
 *  - a signed-out visitor gets the whole board (no cookie is sent, and no
 *    `/me/*` route is touched to draw it);
 *  - the API's order and its `rank` are rendered verbatim — the client never
 *    re-sorts, because a second opinion could only disagree with the number
 *    printed beside the player;
 *  - every row is a link into `/stats?u=`, which is the only way the board is
 *    useful at all;
 *  - a signed-in viewer's own row is marked, matched case-insensitively (the
 *    API resolves usernames that way);
 *  - a dead API and an empty board are calm sentences, never an error surface.
 */
import "@testing-library/jest-dom";
import { render, screen, waitFor, within } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";

import { LeaderboardPage } from "./LeaderboardPage";
import { API_URL } from "@/lib/account/apiUrl";
import { __resetAccountStoreForTests } from "@/lib/account/useAccount";

jest.mock("next/router", () => ({
  useRouter: () => ({ asPath: "/leaderboard", query: {}, push: jest.fn() }),
}));
jest.mock("../Navbar", () => ({ Navbar: () => <nav /> }));

const reply = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

const BOARD = {
  generatedAt: "2026-08-12T12:00:00.000Z",
  players: [
    {
      rank: 1,
      username: "JollyGrin",
      avatarUrl: null,
      level: 12,
      xp: 3400,
      // #718: this player wears three; the board draws slot 1 and no more.
      selectedBadge: "veteran",
      selectedBadges: ["veteran", "first-win", "bot-slayer"],
      gamesPlayed: 123,
      wins: 45,
    },
    {
      rank: 2,
      username: "Emyrk",
      avatarUrl: null,
      level: 9,
      xp: 2100,
      selectedBadge: null,
      gamesPlayed: 60,
      wins: 30,
    },
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

const board = (signedInAs?: string) =>
  install((url) => {
    if (url.includes("/leaderboard")) return reply(200, BOARD);
    if (url.endsWith("/me"))
      return signedInAs
        ? reply(200, { user: { id: "u1", username: signedInAs, avatarUrl: null } })
        : reply(401, {});
    return undefined;
  });

const renderPage = () =>
  render(
    <ChakraProvider>
      <LeaderboardPage />
    </ChakraProvider>,
  );

const rows = () => screen.getAllByTestId("leaderboard-row");

beforeEach(() => {
  __resetAccountStoreForTests();
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("/leaderboard — the board", () => {
  it("renders the API's rows in the API's order, signed out", async () => {
    board();

    renderPage();

    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(within(rows()[0]).getByText("JollyGrin")).toBeInTheDocument();
    expect(within(rows()[0]).getByText("1")).toBeInTheDocument();
    expect(within(rows()[0]).getByText("3,400")).toBeInTheDocument();
    expect(within(rows()[1]).getByText("Emyrk")).toBeInTheDocument();

    const call = fetchMock.mock.calls.find(([url]: [string]) =>
      url.includes("/leaderboard"),
    );
    expect(call[0]).toBe(`${API_URL}/leaderboard?limit=50`);
    expect(call[1]).toMatchObject({ credentials: "omit" });
  });

  it("links every row to that player's public profile", async () => {
    board();

    renderPage();

    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(within(rows()[0]).getByRole("link", { name: "JollyGrin" })).toHaveAttribute(
      "href",
      "/stats?u=JollyGrin",
    );
  });

  it("carries the caveat about what these numbers are worth", async () => {
    board();

    renderPage();

    expect(await screen.findByTestId("stats-caveat")).toHaveTextContent(
      /trophy shelf rather than a competitive ranking/i,
    );
  });
});

describe("/leaderboard — your own row", () => {
  it("marks it, ignoring case", async () => {
    // The API resolves usernames case-insensitively; the highlight has to agree.
    board("jollygrin");

    renderPage();

    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(rows()[0]).toHaveAttribute("data-self", "true");
    expect(within(rows()[0]).getByText("You")).toBeInTheDocument();
    expect(rows()[1]).not.toHaveAttribute("data-self");
  });

  it("marks nobody for a guest", async () => {
    board();

    renderPage();

    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(screen.queryByText("You")).toBeNull();
  });
});

describe("/leaderboard — the quiet states", () => {
  it("says so when the API is unreachable", async () => {
    install(() => {
      throw new TypeError("Failed to fetch");
    });

    renderPage();

    expect(
      await screen.findByText(/leaderboard is unavailable right now/i),
    ).toBeInTheDocument();
    expect(screen.queryAllByTestId("leaderboard-row")).toHaveLength(0);
  });

  it("invites the first player when the board is empty", async () => {
    install((url) =>
      url.includes("/leaderboard")
        ? reply(200, { generatedAt: null, players: [] })
        : reply(401, {}),
    );

    renderPage();

    expect(await screen.findByText(/Nobody is on the board yet/i)).toBeInTheDocument();
  });
});
