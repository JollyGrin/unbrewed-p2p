/**
 * /account (#573). The page is the first place the accounts epic shows a
 * player their own data, so these pin the three things that could hurt:
 *
 *  - a GUEST costs zero new requests (the epic's standing rule) and gets the
 *    same sign-in flow the navbar chip offers, not a blank page;
 *  - an API that is down, unconfigured, or answering 503 reads as an empty
 *    shelf, never as an error;
 *  - the rows say the right thing — win/loss/draw, bot tiers, and a replay
 *    link only when this browser actually has the replay.
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";

import { AccountPage } from "./AccountPage";
import { API_URL } from "@/lib/account/apiUrl";
import { __resetAccountStoreForTests } from "@/lib/account/useAccount";
import { __resetBadgeStoreForTests } from "@/lib/account/useBadges";
import type { ReplayIndexEntry } from "@/lib/pro/replayStore";

jest.mock("next/router", () => ({
  useRouter: () => ({ asPath: "/account", query: {}, push: jest.fn() }),
}));
// Relative paths, not the `@/` alias: SWC rewrites alias *imports* from
// tsconfig paths, but leaves a `jest.mock()` string argument alone, and jest's
// own resolver knows nothing about `@/`.
//
// The navbar drags in the whole site chrome (and its own account chip, which
// would double the /me probe); this page's own content is what's under test.
jest.mock("../Navbar", () => ({ Navbar: () => <nav /> }));

let savedReplays: ReplayIndexEntry[] = [];
jest.mock("../../lib/pro/replayStore", () => ({
  listReplays: () => savedReplays,
}));

const ENDED_MS = Date.parse("2026-08-05T12:00:00.000Z");

const gameRow = (over: Record<string, unknown> = {}) => ({
  id: "g1",
  endedAt: new Date(ENDED_MS).toISOString(),
  map: "mended-drum",
  turns: 14,
  durationSeconds: 733,
  endCondition: "hp_zero",
  draw: false,
  you: { heroId: "thrall", heroName: "Thrall", won: true, finalHealth: 4 },
  opponents: [
    { heroId: "king-kong", heroName: "King Kong", pilot: "human", botDifficulty: null },
  ],
  ...over,
});

const reply = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

const USER = { id: "u1", username: "JollyGrin", avatarUrl: null };

let fetchMock: jest.Mock;

/** Route requests by path so a test only states the answers it cares about. */
const install = (
  handler: (url: string) => Response | Promise<Response> | undefined,
) => {
  fetchMock.mockImplementation(async (url: string) => {
    const answer = handler(url);
    if (answer) return answer;
    throw new TypeError(`unexpected fetch: ${url}`);
  });
};

const signedInWith = (pages: Record<string, unknown>) =>
  install((url) => {
    if (url.endsWith("/me")) return reply(200, { user: USER });
    if (url.includes("/me/games")) {
      const before = new URL(url).searchParams.get("before") ?? "";
      const page = pages[before];
      return page ? reply(200, page) : reply(503, { error: "boom" });
    }
    return undefined;
  });

const renderPage = () =>
  render(
    <ChakraProvider>
      <AccountPage />
    </ChakraProvider>,
  );

const gamesRequests = () =>
  fetchMock.mock.calls.filter(([url]: [string]) => url.includes("/me/games"));

beforeEach(() => {
  __resetAccountStoreForTests();
  __resetBadgeStoreForTests();
  savedReplays = [];
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("AccountPage — signed out and offline", () => {
  it("offers the sign-in flow and makes no history call for a guest", async () => {
    install((url) => (url.endsWith("/me") ? reply(401, {}) : undefined));

    renderPage();

    const link = await screen.findByText("Sign in with Discord");
    expect(link.closest("a")).toHaveAttribute(
      "href",
      `${API_URL}/auth/discord?return_to=%2Faccount`,
    );
    expect(gamesRequests()).toHaveLength(0);
  });

  it("says so calmly when the accounts API is unreachable", async () => {
    install(() => {
      throw new TypeError("Failed to fetch");
    });

    renderPage();

    expect(
      await screen.findByText(/Accounts are unavailable right now/i),
    ).toBeInTheDocument();
    expect(gamesRequests()).toHaveLength(0);
  });
});

describe("AccountPage — signed in", () => {
  it("shows the profile header and a sign-out button", async () => {
    signedInWith({ "": { games: [], nextBefore: null } });

    renderPage();

    expect(await screen.findByText("JollyGrin")).toBeInTheDocument();
    expect(screen.getByText("Signed in with Discord")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sign out" }),
    ).toBeInTheDocument();
  });

  it("falls back to a placeholder when the Discord avatar 404s", async () => {
    install((url) => {
      if (url.endsWith("/me"))
        return reply(200, {
          user: { ...USER, avatarUrl: "https://cdn.discordapp.com/gone.png" },
        });
      if (url.includes("/me/games"))
        return reply(200, { games: [], nextBefore: null });
      return undefined;
    });

    renderPage();

    const avatar = await screen.findByTestId("account-avatar");
    fireEvent.error(avatar);
    await waitFor(() =>
      expect(screen.queryByTestId("account-avatar")).toBeNull(),
    );
    // The header itself survives — only the image is swapped out.
    expect(screen.getByText("JollyGrin")).toBeInTheDocument();
  });

  it("renders win, loss, draw and bot rows", async () => {
    signedInWith({
      "": {
        games: [
          gameRow(),
          gameRow({
            id: "g2",
            you: { heroId: "thrall", heroName: "Thrall", won: false, finalHealth: 0 },
            opponents: [
              {
                heroId: "batman",
                heroName: "Batman",
                pilot: "bot:hard",
                botDifficulty: "hard",
              },
            ],
          }),
          gameRow({
            id: "g3",
            draw: true,
            opponents: [
              {
                heroId: "medusa",
                heroName: "Medusa",
                // A bot id that names no tier, and no tier column either.
                pilot: "bot:gruncle-v2",
                botDifficulty: null,
              },
            ],
          }),
        ],
        nextBefore: null,
      },
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getAllByTestId("account-game-row")).toHaveLength(3),
    );
    expect(screen.getByText("Win")).toBeInTheDocument();
    expect(screen.getByText("Loss")).toBeInTheDocument();
    expect(screen.getByText("Draw")).toBeInTheDocument();

    // The matchup spans several nodes ("vs" is its own span), so read the row.
    const rows = screen.getAllByTestId("account-game-row").map((row) =>
      row.textContent?.replace(/\s+/g, " "),
    );
    // Human opponents are unqualified; bots carry their tier.
    expect(rows[0]).toContain("Thrall vs King Kong");
    expect(rows[0]).not.toContain("bot");
    expect(rows[1]).toContain("Thrall vs Batman (Hard bot)");
    expect(rows[2]).toContain("Thrall vs Medusa (Bot)");

    // Board title, length and how it ended, on one scannable line.
    expect(rows[0]).toContain("The Mended Drum · 14 turns · 12m 13s · hp zero");
  });

  it("walks pages with the opaque cursor and stops offering more at the end", async () => {
    signedInWith({
      "": { games: [gameRow()], nextBefore: "cursor-1" },
      "cursor-1": { games: [gameRow({ id: "g2" })], nextBefore: null },
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getAllByTestId("account-game-row")).toHaveLength(1),
    );
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));

    await waitFor(() =>
      expect(screen.getAllByTestId("account-game-row")).toHaveLength(2),
    );
    expect(gamesRequests()[1][0]).toContain("before=cursor-1");
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("shows an empty shelf, not an error, when there is no history", async () => {
    signedInWith({ "": { games: [], nextBefore: null } });

    renderPage();

    expect(await screen.findByText(/No games here yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId("account-game-row")).toBeNull();
  });

  it("shows one calm line — and no retry — when history answers 503", async () => {
    install((url) => {
      if (url.endsWith("/me")) return reply(200, { user: USER });
      if (url.includes("/me/games"))
        return reply(503, { error: "telemetry_not_configured" });
      return undefined;
    });

    renderPage();

    expect(
      await screen.findByText(/Game history is unavailable right now/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("account-game-row")).toBeNull();
    expect(gamesRequests()).toHaveLength(1);
  });

  it("links a row to a replay only when this browser saved one", async () => {
    savedReplays = [
      {
        id: "r1234abcd",
        savedAt: ENDED_MS,
        starred: false,
        bytes: 100,
        winner: "p1",
        heroes: ["thrall", "king-kong"],
        turns: 14,
        endedAt: ENDED_MS,
        mapTitle: "The Mended Drum",
      },
    ];
    signedInWith({
      "": {
        games: [
          gameRow(),
          gameRow({ id: "g2", turns: 99, endedAt: "2026-07-01T00:00:00.000Z" }),
        ],
        nextBefore: null,
      },
    });

    renderPage();

    const links = await screen.findAllByRole("link", { name: /Replay/ });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/pro/replays?open=r1234abcd");
  });
});
