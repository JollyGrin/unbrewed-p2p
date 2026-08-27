/**
 * The badge case and the level bar on /account (#577), rendered through the
 * real page so the guest and offline gates are exercised where they live.
 *
 * What these pin:
 *  - a GUEST still costs zero new requests — the epic's standing rule, and the
 *    reason `/me/badges` is gated behind the `/me` probe rather than fired on
 *    mount;
 *  - the grid's three states read differently (locked / unlocked / worn) and
 *    only an unlocked tile is a control at all;
 *  - selecting is a toggle, three fit, and a fourth pick swaps the last slot
 *    (#718) — with the worn strip carrying the ORDER, which is the whole reason
 *    it exists;
 *  - a server that refuses the pick (422) leaves a sentence, not a broken page;
 *  - the level bar hides ENTIRELY on an API that doesn't send the block — the
 *    failure mode of a client deployed ahead of its API.
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";

import { AccountPage } from "./AccountPage";
import { __resetAccountStoreForTests } from "@/lib/account/useAccount";
import { __resetBadgeStoreForTests } from "@/lib/account/useBadges";

jest.mock("next/router", () => ({
  useRouter: () => ({ asPath: "/account", query: {}, push: jest.fn() }),
}));
// Relative paths: SWC rewrites `@/` in imports, but not inside jest.mock().
jest.mock("../Navbar", () => ({ Navbar: () => <nav /> }));
jest.mock("../../lib/pro/replayStore", () => ({ listReplays: () => [] }));

const USER = { id: "u1", username: "JollyGrin", avatarUrl: null };

const STATS = {
  totalGames: 12,
  wins: 7,
  losses: 4,
  draws: 1,
  firstGameAt: "2026-03-14T10:00:00.000Z",
  lastGameAt: "2026-08-01T21:30:00.000Z",
  byHero: [{ heroId: "thrall", heroName: "Thrall", games: 12, wins: 7 }],
  level: 5,
  xp: 1800,
  xpForNext: 2100,
};

const badge = (over: Record<string, unknown>) => ({
  id: "first-win",
  name: "First Blood",
  blurb: "Won your first game.",
  unlocked: true,
  unlockedWhy: "Win a game (1/1)",
  ...over,
});

const CATALOG = {
  badges: [
    badge({}),
    badge({
      id: "veteran",
      name: "Veteran",
      blurb: "A hundred games deep.",
      unlocked: false,
      unlockedWhy: "Play 100 games (12/100)",
    }),
  ],
  selected: [],
};

/** Four unlocked badges — enough to fill the shelf and then pick a fourth. */
const FOUR = {
  badges: [
    badge({}),
    badge({ id: "regular", name: "Regular" }),
    badge({ id: "streak-5", name: "Hot Streak" }),
    badge({ id: "bot-slayer", name: "Bot Slayer" }),
  ],
  selected: [] as string[],
};

const reply = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

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

/**
 * Signed in, an empty shelf, and whatever the test wants from the two new
 * routes.
 *
 * `GET` and `PUT` share one URL since #718, so the handler dispatches on the
 * METHOD — and the default write simply echoes back whatever was asked for,
 * which is what the real API does on a legal pick.
 */
const signedIn = ({
  stats = () => reply(200, STATS),
  badges = () => reply(200, CATALOG),
  write = (body: { ids: string[] }) => reply(200, { selected: body.ids }),
}: {
  stats?: () => Response;
  badges?: () => Response;
  write?: (body: { ids: string[] }) => Response;
} = {}) =>
  install((url, init) => {
    if (url.endsWith("/me")) return reply(200, { user: USER });
    if (url.includes("/me/stats")) return stats();
    if (url.endsWith("/me/badges")) {
      return init?.method === "PUT"
        ? write(JSON.parse(String(init.body)))
        : badges();
    }
    if (url.includes("/me/games")) return reply(200, { games: [], nextBefore: null });
    return undefined;
  });

const renderPage = () =>
  render(
    <ChakraProvider>
      <AccountPage />
    </ChakraProvider>,
  );

const tile = (id: string) => {
  const found = screen
    .getAllByTestId("account-badge")
    .find((node) => node.getAttribute("data-badge-id") === id);
  if (!found) throw new Error(`no "${id}" tile`);
  return found;
};

const badgeCalls = (method: "GET" | "PUT") =>
  fetchMock.mock.calls.filter(
    ([url, init]: [string, RequestInit | undefined]) =>
      String(url).endsWith("/me/badges") &&
      (init?.method ?? "GET") === method,
  );

const badgeWrites = () => badgeCalls("PUT");

const badgeReads = () => badgeCalls("GET");

/** The `ids` body of the nth write. */
const wrote = (n = 0) => JSON.parse(badgeWrites()[n][1].body).ids;

/** The worn strip's slots, in order: the badge id in each, or null when empty. */
const strip = () =>
  screen
    .getAllByTestId("account-worn-slot")
    .map((slot) => slot.getAttribute("data-badge-id"));

beforeEach(() => {
  __resetAccountStoreForTests();
  __resetBadgeStoreForTests();
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("badge case — the grid", () => {
  it("shows locked badges too, with the unlock hint and its progress", async () => {
    signedIn();

    renderPage();

    await waitFor(() => expect(screen.getAllByTestId("account-badge")).toHaveLength(2));
    // A locked badge is worth showing: it says what there is to go after.
    const locked = tile("veteran");
    expect(locked).toHaveAttribute("data-locked", "true");
    expect(within(locked).getByText("Play 100 games (12/100)")).toBeInTheDocument();
    // An unlocked one shows what it MEANS, not what it took.
    const unlocked = tile("first-win");
    expect(unlocked).not.toHaveAttribute("data-locked");
    expect(within(unlocked).getByText("Won your first game.")).toBeInTheDocument();
    expect(screen.getByText(/1 of 2 unlocked/)).toBeInTheDocument();
  });

  it("makes only an unlocked badge a control", async () => {
    signedIn();

    renderPage();

    await waitFor(() => expect(screen.getAllByTestId("account-badge")).toHaveLength(2));
    // A focusable control that refuses every press is worse than no control.
    expect(tile("first-win").tagName).toBe("BUTTON");
    expect(tile("veteran").tagName).not.toBe("BUTTON");

    fireEvent.click(tile("veteran"));
    expect(badgeWrites()).toHaveLength(0);
  });

  it("draws art for a badge this build has never heard of", async () => {
    // Forward compat: the catalog is the API's, and a new id must still be
    // wearable here — the neutral glyph plus the API's own name and blurb.
    signedIn({
      badges: () =>
        reply(200, {
          badges: [badge({ id: "moon-walker", name: "Moon Walker" })],
          selected: [],
        }),
    });

    renderPage();

    const row = await waitFor(() => tile("moon-walker"));
    expect(within(row).getByText("Moon Walker")).toBeInTheDocument();
    expect(within(row).getByTestId("badge-glyph")).toHaveAttribute(
      "data-badge-id",
      "moon-walker",
    );
  });
});

describe("badge case — wearing one", () => {
  it("wears an unlocked badge, and shows it beside the name", async () => {
    signedIn();

    renderPage();

    await waitFor(() => expect(screen.getAllByTestId("account-badge")).toHaveLength(2));
    expect(screen.queryByTestId("account-badge-chip")).not.toBeInTheDocument();

    fireEvent.click(tile("first-win"));

    await waitFor(() =>
      expect(tile("first-win")).toHaveAttribute("data-selected", "true"),
    );
    expect(wrote()).toEqual(["first-win"]);
    const chip = screen.getByTestId("account-badge-chip");
    expect(within(chip).getByText("First Blood")).toBeInTheDocument();
    // And it lands in slot 1 of the strip, which is the order the HUD reads.
    expect(strip()).toEqual(["first-win", null, null]);
  });

  it("takes it off again when the worn badge is clicked", async () => {
    signedIn({ badges: () => reply(200, { ...CATALOG, selected: ["first-win"] }) });

    renderPage();

    await waitFor(() =>
      expect(tile("first-win")).toHaveAttribute("data-selected", "true"),
    );

    fireEvent.click(tile("first-win"));

    await waitFor(() =>
      expect(screen.queryByTestId("account-badge-chip")).not.toBeInTheDocument(),
    );
    // Clearing must send an explicit empty list — the only body the API reads
    // as "off", and the one write it honours with telemetry down.
    expect(wrote()).toEqual([]);
  });

  it("says its piece and greys the tile when the server refuses (422)", async () => {
    // Honestly reachable: stats moved under a page left open, so the badge the
    // client believed was unlocked no longer is.
    signedIn({ write: () => reply(422, { error: "not_unlocked" }) });

    renderPage();

    await waitFor(() => expect(screen.getAllByTestId("account-badge")).toHaveLength(2));
    fireEvent.click(tile("first-win"));

    const notice = await screen.findByTestId("account-badge-notice");
    expect(notice.textContent).toMatch(/isn't unlocked yet/);
    // Nothing is worn, and the grid stops offering a pick the server won't take.
    expect(screen.queryByTestId("account-badge-chip")).not.toBeInTheDocument();
    expect(tile("first-win")).toHaveAttribute("data-locked", "true");
  });

  it("stays calm when the write can't be delivered at all", async () => {
    signedIn({ write: () => reply(503, { error: "upstream_unavailable" }) });

    renderPage();

    await waitFor(() => expect(screen.getAllByTestId("account-badge")).toHaveLength(2));
    fireEvent.click(tile("first-win"));

    const notice = await screen.findByTestId("account-badge-notice");
    expect(notice.textContent).toMatch(/Couldn't save that just now/);
    expect(screen.queryByTestId("account-badge-chip")).not.toBeInTheDocument();
    // Still offered — this one is worth trying again.
    expect(tile("first-win")).not.toHaveAttribute("data-locked");
  });
});

describe("badge case — the worn strip (#718)", () => {
  const wearing = (ids: string[], over: Parameters<typeof signedIn>[0] = {}) =>
    signedIn({ badges: () => reply(200, { ...FOUR, selected: ids }), ...over });

  it("wears three, in order, and says which slot each tile is in", async () => {
    wearing(["streak-5", "first-win", "bot-slayer"]);

    renderPage();

    await waitFor(() =>
      expect(strip()).toEqual(["streak-5", "first-win", "bot-slayer"]),
    );
    // The grid says the same thing from the other direction.
    expect(within(tile("streak-5")).getByText("1")).toBeInTheDocument();
    expect(within(tile("bot-slayer")).getByText("3")).toBeInTheDocument();
    // And the header chip is the same cluster in the same order.
    const chip = screen.getByTestId("account-badge-chip");
    expect(
      within(chip)
        .getAllByTestId("badge-glyph")
        .map((node) => node.getAttribute("data-badge-id")),
    ).toEqual(["streak-5", "first-win", "bot-slayer"]);
  });

  it("appends a second and third pick rather than replacing", async () => {
    wearing(["first-win"]);

    renderPage();

    await waitFor(() => expect(strip()).toEqual(["first-win", null, null]));
    fireEvent.click(tile("regular"));
    await waitFor(() => expect(strip()).toEqual(["first-win", "regular", null]));
    expect(wrote()).toEqual(["first-win", "regular"]);
  });

  it("swaps the LAST slot when a fourth is picked", async () => {
    // Doing nothing would make a player go and find the badge to remove first;
    // slots 1 and 2 are the ones they chose to lead with, so the tail goes.
    wearing(["first-win", "regular", "streak-5"]);

    renderPage();

    await waitFor(() =>
      expect(strip()).toEqual(["first-win", "regular", "streak-5"]),
    );

    fireEvent.click(tile("bot-slayer"));

    await waitFor(() =>
      expect(strip()).toEqual(["first-win", "regular", "bot-slayer"]),
    );
    expect(wrote()).toEqual(["first-win", "regular", "bot-slayer"]);
  });

  it("reorders by dragging one slot onto another", async () => {
    wearing(["first-win", "regular", "streak-5"]);

    renderPage();

    await waitFor(() =>
      expect(strip()).toEqual(["first-win", "regular", "streak-5"]),
    );

    const handle = (id: string) =>
      within(
        screen
          .getAllByTestId("account-worn-slot")
          .find((slot) => slot.getAttribute("data-badge-id") === id)!,
      ).getByRole("button");

    fireEvent.dragStart(handle("streak-5"));
    fireEvent.drop(handle("first-win"));

    await waitFor(() =>
      expect(strip()).toEqual(["streak-5", "first-win", "regular"]),
    );
    // One write, carrying the whole order — never a per-slot delta.
    expect(wrote()).toEqual(["streak-5", "first-win", "regular"]);
  });

  it("reorders from the keyboard too, since a drag has no keyboard equal", async () => {
    wearing(["first-win", "regular"]);

    renderPage();

    await waitFor(() => expect(strip()).toEqual(["first-win", "regular", null]));

    const slot = within(
      screen
        .getAllByTestId("account-worn-slot")
        .find((node) => node.getAttribute("data-badge-id") === "regular")!,
    ).getByRole("button");
    fireEvent.keyDown(slot, { key: "ArrowLeft" });

    await waitFor(() => expect(strip()).toEqual(["regular", "first-win", null]));
  });

  it("takes a badge off when its slot is pressed", async () => {
    wearing(["first-win", "regular"]);

    renderPage();

    await waitFor(() => expect(strip()).toEqual(["first-win", "regular", null]));

    fireEvent.click(
      within(
        screen
          .getAllByTestId("account-worn-slot")
          .find((node) => node.getAttribute("data-badge-id") === "first-win")!,
      ).getByRole("button"),
    );

    await waitFor(() => expect(strip()).toEqual(["regular", null, null]));
    expect(wrote()).toEqual(["regular"]);
  });

  it("shows three empty slots when nothing is worn", async () => {
    wearing([]);

    renderPage();

    await waitFor(() => expect(strip()).toEqual([null, null, null]));
    expect(badgeWrites()).toHaveLength(0);
  });

  it("greys the badge the server refuses, and keeps the others on", async () => {
    // Only the id this write ADDED can be the one the server refused — the rest
    // it handed us itself, moments ago.
    wearing(["first-win"], { write: () => reply(422, { error: "not_unlocked" }) });

    renderPage();

    await waitFor(() => expect(strip()).toEqual(["first-win", null, null]));
    fireEvent.click(tile("regular"));

    await screen.findByTestId("account-badge-notice");
    expect(tile("regular")).toHaveAttribute("data-locked", "true");
    expect(tile("first-win")).not.toHaveAttribute("data-locked");
    expect(strip()).toEqual(["first-win", null, null]);
  });
});

describe("badge case — degradation", () => {
  it("collapses to one quiet line on a 503, page otherwise intact", async () => {
    signedIn({ badges: () => reply(503, { error: "telemetry_not_configured" }) });

    renderPage();

    await screen.findByText(/Badges aren't available right now/);
    expect(screen.queryAllByTestId("account-badge")).toHaveLength(0);
    // The rest of /account is untouched.
    expect(screen.getByText("My record")).toBeInTheDocument();
    expect(screen.getByText("My games")).toBeInTheDocument();
  });

  it("costs a guest no badge request at all", async () => {
    install((url) => (url.endsWith("/me") ? reply(401, {}) : undefined));

    renderPage();

    await screen.findByText("Sign in with Discord");
    expect(badgeReads()).toHaveLength(0);
    expect(badgeWrites()).toHaveLength(0);
  });

  it("asks for the case exactly once however many consumers mount", async () => {
    signedIn();

    renderPage();

    await waitFor(() => expect(screen.getAllByTestId("account-badge")).toHaveLength(2));
    expect(badgeReads()).toHaveLength(1);
  });
});

describe("profile header — level bar", () => {
  it("draws the level and the bar across the current level", async () => {
    signedIn();

    renderPage();

    const bar = await screen.findByTestId("account-level-bar");
    expect(screen.getByTestId("account-level-number").textContent).toBe("5");
    // Level 5 runs 1500 → 2100; 1800 is half way, and 300 is the number a
    // player can act on.
    expect(bar).toHaveAttribute("aria-valuenow", "50");
    expect(screen.getByText("300 XP to go")).toBeInTheDocument();
  });

  it("hides entirely when the API doesn't send the progression block", async () => {
    const { level, xp, xpForNext, ...WITHOUT } = STATS;
    signedIn({ stats: () => reply(200, WITHOUT) });

    renderPage();

    // Wait for something else off the same payload, so this isn't just early.
    await screen.findByText("My record");
    await waitFor(() =>
      expect(screen.queryAllByTestId("account-stat-tile").length).toBeGreaterThan(0),
    );
    expect(screen.queryByTestId("account-level")).not.toBeInTheDocument();
  });

  it("hides when stats are unavailable, rather than claiming level 0", async () => {
    signedIn({ stats: () => reply(503, { error: "telemetry_not_configured" }) });

    renderPage();

    await screen.findByText(/No Pro games on record yet/);
    expect(screen.queryByTestId("account-level")).not.toBeInTheDocument();
  });
});
