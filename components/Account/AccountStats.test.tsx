/**
 * The "My record" block on /account (#574), rendered through the real page so
 * the guest and offline gates are exercised where they actually live.
 *
 * What these pin:
 *  - a GUEST still costs zero new requests (the epic's standing rule);
 *  - a payload carrying ONLY the #52 base fields renders the headline and the
 *    heroes table and hides every enriched section — the failure mode of a
 *    client deployed ahead of its API;
 *  - zero games and a 503 read as the same quiet "go play a game" line, with
 *    the rest of /account still on the page;
 *  - the long tables fold, and the fold opens.
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";

import { AccountPage } from "./AccountPage";
import { CASUAL_SPLIT_NOTE, COLLAPSE_AFTER } from "./AccountStats";
import { __resetAccountStoreForTests } from "@/lib/account/useAccount";
import { __resetBadgeStoreForTests } from "@/lib/account/useBadges";

jest.mock("next/router", () => ({
  useRouter: () => ({ asPath: "/account", query: {}, push: jest.fn() }),
}));
// Relative paths: SWC rewrites `@/` in imports, but not inside jest.mock().
jest.mock("../Navbar", () => ({ Navbar: () => <nav /> }));
jest.mock("../../lib/pro/replayStore", () => ({ listReplays: () => [] }));

const USER = { id: "u1", username: "JollyGrin", avatarUrl: null };

/** Base fields only — what an API on the pre-enrichment deploy answers. */
const BASE_STATS = {
  totalGames: 12,
  wins: 7,
  losses: 4,
  draws: 1,
  firstGameAt: "2026-03-14T10:00:00.000Z",
  lastGameAt: "2026-08-01T21:30:00.000Z",
  byHero: [
    { heroId: "thrall", heroName: "Thrall", games: 8, wins: 5 },
    { heroId: "medusa", heroName: "Medusa", games: 4, wins: 2 },
  ],
  username: "JollyGrin",
  avatarUrl: null,
};

/**
 * The enriched payload, with games in EVERY opponent tier (#592). The totals
 * cover all 15 of them; the record the page shows covers the 11 that count.
 */
const FULL_STATS = {
  ...BASE_STATS,
  totalGames: 15,
  wins: 9,
  losses: 5,
  draws: 1,
  avgDurationSeconds: 733,
  avgTurns: 13.6,
  streaks: { current: 2, best: 5 },
  recentForm: ["W", "W", "L", "D", "W"],
  byOpponentHero: [
    { heroId: "batman", heroName: "Batman", games: 6, wins: 2 },
    { heroId: "king-kong", heroName: "King Kong", games: 4, wins: 3 },
  ],
  byMap: [
    { map: "mended-drum", games: 9, wins: 6 },
    { map: "hells-kitchen", games: 3, wins: 1 },
  ],
  byOpponentKind: {
    human: { games: 5, wins: 3, draws: 1 },
    bots: [
      { difficulty: "hard", games: 4, wins: 2, draws: 0 },
      // No `draws` key: the pre-telemetry#58 row shape, still countable.
      { difficulty: "easy", games: 3, wins: 2 },
      { difficulty: "expert", games: 2, wins: 1, draws: 0 },
      { difficulty: "medium", games: 1, wins: 1, draws: 0 },
    ],
  },
  firstPlayer: {
    first: { games: 7, wins: 5, draws: 1 },
    second: { games: 5, wins: 2, draws: 0 },
  },
};

const reply = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

let fetchMock: jest.Mock;

const install = (
  handler: (url: string) => Response | Promise<Response> | undefined,
) => {
  fetchMock.mockImplementation(async (url: string) => {
    const answer = handler(url);
    if (answer) return answer;
    throw new TypeError(`unexpected fetch: ${url}`);
  });
};

/** Signed in, an empty history shelf, and whatever stats answer a test wants. */
const signedInWithStats = (stats: () => Response) =>
  install((url) => {
    if (url.endsWith("/me")) return reply(200, { user: USER });
    if (url.includes("/me/stats")) return stats();
    if (url.includes("/me/games")) return reply(200, { games: [], nextBefore: null });
    return undefined;
  });

const renderPage = () =>
  render(
    <ChakraProvider>
      <AccountPage />
    </ChakraProvider>,
  );

const statsRequests = () =>
  fetchMock.mock.calls.filter(([url]: [string]) => url.includes("/me/stats"));

const section = () =>
  screen.getByRole("region", { name: "My record" }) ??
  screen.getByLabelText("My record");

const tileValue = (label: string): string => {
  const tiles = screen.getAllByTestId("account-stat-tile");
  const tile = tiles.find((node) =>
    node.textContent?.toLowerCase().startsWith(label.toLowerCase()),
  );
  if (!tile) throw new Error(`no "${label}" tile`);
  return (tile.textContent ?? "").slice(label.length);
};

const rowTexts = (testId: string) =>
  screen
    .queryAllByTestId(testId)
    .map((row) => row.textContent?.replace(/\s+/g, " ").trim() ?? "");

beforeEach(() => {
  __resetAccountStoreForTests();
  __resetBadgeStoreForTests();
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("AccountStats — the full payload", () => {
  it("renders the headline tiles", async () => {
    signedInWithStats(() => reply(200, FULL_STATS));

    renderPage();

    await screen.findByText("My record");
    await waitFor(() =>
      expect(screen.queryAllByTestId("account-stat-tile").length).toBeGreaterThan(
        0,
      ),
    );
    // Everything played is still the games tile…
    expect(tileValue("Games")).toBe("15last Aug 2026");
    // …but the record is the 11 counted games only: 6–4–1, 6 of 11.
    expect(tileValue("Win rate")).toBe("55%");
    expect(tileValue("W–L–D")).toBe("6–4–1win–loss–draw");
    expect(tileValue("Win streak")).toBe("2best 5");
    expect(tileValue("Game length")).toBe("12:1314 turns avg");
    expect(tileValue("Playing since")).toBe("Mar 2026");
  });

  it("renders the last-ten form strip newest first, and says so to a reader", async () => {
    signedInWithStats(() => reply(200, FULL_STATS));

    renderPage();

    const strip = await screen.findByTestId("account-stat-form");
    expect(strip.textContent).toBe("WWLDW");
    expect(strip).toHaveAttribute(
      "aria-label",
      "Last 5 games, newest first: win, win, loss, draw, win",
    );
  });

  it("renders my heroes, matchups and boards with their win rates", async () => {
    signedInWithStats(() => reply(200, FULL_STATS));

    renderPage();

    await waitFor(() =>
      expect(screen.queryAllByTestId("account-stat-hero-row")).toHaveLength(2),
    );
    expect(rowTexts("account-stat-hero-row")).toEqual([
      "Thrall8563%",
      "Medusa4250%",
    ]);
    expect(rowTexts("account-stat-matchup-row")).toEqual([
      "Batman6233%",
      "King Kong4375%",
    ]);
    // Boards resolve through the map catalog, unknown ids stay raw.
    const boards = rowTexts("account-stat-map-row");
    expect(boards[0]).toBe("The Mended Drum9667%");
    expect(boards[1]).toContain("3133%");
  });

  it("renders the splits as small pairs, not tables", async () => {
    signedInWithStats(() => reply(200, FULL_STATS));

    renderPage();

    await waitFor(() =>
      expect(
        screen.queryAllByTestId("account-stat-split").length,
      ).toBeGreaterThan(0),
    );
    const splits = screen
      .getAllByTestId("account-stat-split")
      .map((node) => node.textContent?.replace(/\s+/g, " ").trim());
    // Humans, then the tiers that count hardest-first, then the casual pair —
    // and the casual rows carry a games count and no record at all.
    expect(splits).toEqual([
      "vs humans60% · 5 games",
      "vs expert bots50% · 2 games",
      "vs hard bots50% · 4 games",
      `vs medium bots1 game${CASUAL_SPLIT_NOTE}`,
      `vs easy bots3 games${CASUAL_SPLIT_NOTE}`,
      "going first71% · 7 games",
      "going second40% · 5 games",
    ]);
  });

  it("demotes the easy/medium rows and says why, next to them", async () => {
    signedInWithStats(() => reply(200, FULL_STATS));

    renderPage();

    await waitFor(() =>
      expect(
        screen.queryAllByTestId("account-stat-split").length,
      ).toBeGreaterThan(0),
    );
    const casual = screen
      .getAllByTestId("account-stat-split")
      .filter((node) => node.dataset.casual === "true");

    expect(casual.map((node) => node.textContent)).toEqual([
      `vs medium bots1 game${CASUAL_SPLIT_NOTE}`,
      `vs easy bots3 games${CASUAL_SPLIT_NOTE}`,
    ]);
    // No percentage anywhere on a demoted row — that is the whole point.
    for (const node of casual) {
      expect(node.textContent).not.toMatch(/%/);
      expect(within(node).getByText(CASUAL_SPLIT_NOTE)).toBeInTheDocument();
    }
    // …and the headline says where the missing games went.
    expect(
      screen.getByTestId("account-stat-casual-note").textContent,
    ).toBe("4 casual bot games (easy/medium) not counted");
  });

  it("says nothing about casual games when the player has none", async () => {
    signedInWithStats(() =>
      reply(200, {
        ...FULL_STATS,
        byOpponentKind: {
          human: { games: 5, wins: 3, draws: 1 },
          bots: [{ difficulty: "hard", games: 4, wins: 2, draws: 0 }],
        },
      }),
    );

    renderPage();

    await waitFor(() =>
      expect(
        screen.queryAllByTestId("account-stat-split").length,
      ).toBeGreaterThan(0),
    );
    expect(screen.queryByTestId("account-stat-casual-note")).toBeNull();
    // Telemetry's own totals, untouched, exactly as before this ticket.
    expect(tileValue("W–L–D")).toBe("9–5–1win–loss–draw");
  });

  it("asks for stats exactly once", async () => {
    signedInWithStats(() => reply(200, FULL_STATS));

    renderPage();

    await screen.findByTestId("account-stat-form");
    expect(statsRequests()).toHaveLength(1);
  });
});

describe("AccountStats — degradation", () => {
  it("renders headline + heroes and hides every enriched section", async () => {
    signedInWithStats(() => reply(200, BASE_STATS));

    renderPage();

    await waitFor(() =>
      expect(screen.queryAllByTestId("account-stat-hero-row")).toHaveLength(2),
    );
    // The base half is all there — and with no per-tier split to exclude
    // anything, the headline is telemetry's own record, as it always was.
    expect(tileValue("Win rate")).toBe("58%");
    expect(tileValue("W–L–D")).toBe("7–4–1win–loss–draw");
    expect(screen.queryByTestId("account-stat-casual-note")).toBeNull();

    // …and nothing the API didn't send is invented.
    expect(screen.queryByTestId("account-stat-form")).toBeNull();
    expect(screen.queryByText("Win streak")).toBeNull();
    expect(screen.queryByText("Game length")).toBeNull();
    expect(screen.queryByText("Matchups")).toBeNull();
    expect(screen.queryByText("Boards")).toBeNull();
    expect(screen.queryAllByTestId("account-stat-split")).toHaveLength(0);
    expect(screen.queryAllByTestId("account-stat-matchup-row")).toHaveLength(0);
    expect(screen.queryAllByTestId("account-stat-map-row")).toHaveLength(0);
  });

  it("hides the seat split when the player has only ever gone first", async () => {
    signedInWithStats(() =>
      reply(200, {
        ...BASE_STATS,
        firstPlayer: { first: { games: 0, wins: 0 }, second: { games: 0, wins: 0 } },
      }),
    );

    renderPage();

    await waitFor(() =>
      expect(screen.queryAllByTestId("account-stat-hero-row")).toHaveLength(2),
    );
    expect(screen.queryByText("Seat")).toBeNull();
  });
});

describe("AccountStats — quiet states", () => {
  it("points a player with no games at /pro instead of empty tables", async () => {
    signedInWithStats(() =>
      reply(200, {
        totalGames: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        byHero: [],
        firstGameAt: null,
        lastGameAt: null,
      }),
    );

    renderPage();

    expect(
      await screen.findByText(/No Pro games on record yet/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Play a Pro game" }),
    ).toHaveAttribute("href", "/pro");
    expect(screen.queryAllByTestId("account-stat-tile")).toHaveLength(0);
    expect(screen.queryAllByTestId("account-stat-hero-row")).toHaveLength(0);
  });

  it("collapses to the same quiet line on a 503, and leaves the rest of the page alone", async () => {
    signedInWithStats(() => reply(503, { error: "upstream_unavailable" }));

    renderPage();

    expect(
      await screen.findByText(/No Pro games on record yet/i),
    ).toBeInTheDocument();
    expect(screen.queryAllByTestId("account-stat-tile")).toHaveLength(0);
    // No retry, and the neighbouring surfaces still rendered.
    expect(statsRequests()).toHaveLength(1);
    expect(screen.getByText("JollyGrin")).toBeInTheDocument();
    expect(screen.getByText("My games")).toBeInTheDocument();
  });

  it("costs a guest no request at all", async () => {
    install((url) => (url.endsWith("/me") ? reply(401, {}) : undefined));

    renderPage();

    await screen.findByText("Sign in with Discord");
    expect(statsRequests()).toHaveLength(0);
    expect(screen.queryByText("My record")).toBeNull();
  });
});

describe("AccountStats — folding a long table", () => {
  const many = (count: number, prefix: string) =>
    Array.from({ length: count }, (_, index) => ({
      heroId: `${prefix}-${index}`,
      heroName: `${prefix} ${index}`,
      // Descending so the fold keeps the most-played at the top.
      games: count - index,
      wins: index % 3,
    }));

  it("shows the top rows, then all of them, then folds again", async () => {
    const total = COLLAPSE_AFTER + 4;
    signedInWithStats(() =>
      reply(200, { ...FULL_STATS, byOpponentHero: many(total, "Foe") }),
    );

    renderPage();

    await waitFor(() =>
      expect(screen.queryAllByTestId("account-stat-matchup-row")).toHaveLength(
        COLLAPSE_AFTER,
      ),
    );
    // Most-played first, and the fold cuts the tail, not the head.
    expect(rowTexts("account-stat-matchup-row")[0]).toContain("Foe 0");

    fireEvent.click(screen.getByRole("button", { name: `Show all ${total}` }));
    expect(screen.getAllByTestId("account-stat-matchup-row")).toHaveLength(total);

    fireEvent.click(screen.getByRole("button", { name: "Show fewer" }));
    expect(screen.getAllByTestId("account-stat-matchup-row")).toHaveLength(
      COLLAPSE_AFTER,
    );
  });

  it("leaves a short table with no toggle at all", async () => {
    signedInWithStats(() => reply(200, FULL_STATS));

    renderPage();

    await waitFor(() =>
      expect(screen.queryAllByTestId("account-stat-matchup-row")).toHaveLength(2),
    );
    expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull();
  });

  it("keeps each table's fold independent", async () => {
    const total = COLLAPSE_AFTER + 2;
    signedInWithStats(() =>
      reply(200, {
        ...FULL_STATS,
        byOpponentHero: many(total, "Foe"),
        byMap: Array.from({ length: total }, (_, index) => ({
          map: `board-${index}`,
          games: total - index,
          wins: 1,
        })),
      }),
    );

    renderPage();

    await waitFor(() =>
      expect(screen.queryAllByTestId("account-stat-map-row")).toHaveLength(
        COLLAPSE_AFTER,
      ),
    );
    const toggles = screen.getAllByRole("button", { name: `Show all ${total}` });
    expect(toggles).toHaveLength(2);

    fireEvent.click(toggles[0]);

    expect(screen.getAllByTestId("account-stat-matchup-row")).toHaveLength(total);
    expect(screen.getAllByTestId("account-stat-map-row")).toHaveLength(
      COLLAPSE_AFTER,
    );
  });
});

describe("AccountStats — the section's own shell", () => {
  it("labels itself so the block is findable, and sits above the history", async () => {
    signedInWithStats(() => reply(200, FULL_STATS));

    renderPage();

    await screen.findByTestId("account-stat-form");
    const stats = section();
    expect(within(stats).getByText("My record")).toBeInTheDocument();
    // Header → record → badges (#577) → games, the order #573 left slots for.
    const headings = screen
      .getAllByRole("heading")
      .map((node) => node.textContent);
    expect(headings).toEqual([
      "JollyGrin",
      "My record",
      "Badge case",
      "My games",
    ]);
  });
});
