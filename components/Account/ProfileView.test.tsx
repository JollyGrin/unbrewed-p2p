/**
 * ProfileView (#590) — the one profile body, rendered in both of its modes.
 *
 * The design rule the feature rests on is that `/account` is a SUPERSET of a
 * public profile, so these pin the differences between the two modes and
 * nothing else:
 *
 *  - the badge case is interactive for its owner and inert for a visitor —
 *    inert meaning "not a control", not "a control that refuses";
 *  - the owner-extras slot renders on /account and has no equivalent to leak
 *    into a public profile;
 *  - a public profile carries the "for fun" caveat and your own page doesn't;
 *  - every SECTION (record, badges, games, level bar) is present either way,
 *    which is the whole point of sharing the component.
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";

import { ProfileView } from "./ProfileView";
import type { AccountStats } from "@/lib/account/stats";
import type { AccountStatsView } from "@/lib/account/useAccountStats";
import type { BadgeCaseState } from "@/lib/account/useBadges";
import type { GameHistoryView } from "@/lib/account/useGameHistory";

jest.mock("../../lib/pro/replayStore", () => ({ listReplays: () => [] }));

const selectBadge = jest.fn();
jest.mock("../../lib/account/useBadges", () => ({
  ...jest.requireActual("../../lib/account/useBadges"),
  selectBadge: (...args: unknown[]) => selectBadge(...args),
}));

const STATS: AccountStats = {
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
  avgDurationSeconds: null,
  avgTurns: null,
  streaks: null,
  recentForm: null,
  byOpponentHero: null,
  byMap: null,
  byOpponentKind: null,
  firstPlayer: null,
};

const BADGES: BadgeCaseState = {
  status: "ready",
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
      unlocked: false,
      unlockedWhy: "Play 100 games (12/100)",
    },
  ],
  selected: "first-win",
  busy: false,
  notice: null,
};

const HISTORY: GameHistoryView = {
  status: "ready",
  games: [
    {
      id: "g1",
      endedAt: "2026-08-05T12:00:00.000Z",
      map: "mended-drum",
      turns: 14,
      durationSeconds: 733,
      endCondition: "hp_zero",
      draw: false,
      you: { heroId: "thrall", heroName: "Thrall", won: true, finalHealth: 4 },
      opponents: [
        {
          heroId: "king-kong",
          heroName: "King Kong",
          pilot: "human",
          botDifficulty: null,
        },
      ],
    },
  ],
  loadingMore: false,
  hasMore: false,
  loadMore: jest.fn(),
};

const statsView: AccountStatsView = { status: "ready", stats: STATS };

const renderView = (props: Partial<React.ComponentProps<typeof ProfileView>>) =>
  render(
    <ChakraProvider>
      <ProfileView
        username="JollyGrin"
        avatarUrl={null}
        subtitle="Signed in with Discord"
        badges={BADGES}
        stats={statsView}
        history={HISTORY}
        {...props}
      />
    </ChakraProvider>,
  );

const badgeTile = (id: string) =>
  screen
    .getAllByTestId("account-badge")
    .find((tile) => tile.getAttribute("data-badge-id") === id)!;

beforeEach(() => selectBadge.mockClear());

describe("ProfileView — every mode", () => {
  it.each([true, false])("renders all four sections (owner=%s)", (owner) => {
    renderView({ owner, subtitle: "whoever" });

    expect(screen.getByText("JollyGrin")).toBeInTheDocument();
    expect(screen.getByTestId("account-level")).toBeInTheDocument();
    // Record, badge case and match history, each by their own content.
    expect(screen.getAllByTestId("account-stat-tile").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("account-badge")).toHaveLength(2);
    expect(screen.getAllByTestId("account-game-row")).toHaveLength(1);
  });

  it("shows the worn badge beside the name in both modes", () => {
    const { unmount } = renderView({ owner: true });
    expect(screen.getByTestId("account-badge-chip")).toHaveTextContent(
      "First Blood",
    );
    unmount();

    renderView({ owner: false });
    expect(screen.getByTestId("account-badge-chip")).toHaveTextContent(
      "First Blood",
    );
  });
});

describe("ProfileView — owner mode", () => {
  it("makes an unlocked badge a control that selects", () => {
    renderView({ owner: true });

    const tile = badgeTile("first-win");
    expect(tile.tagName).toBe("BUTTON");
    fireEvent.click(tile);
    // Wearing the badge you already wear takes it off.
    expect(selectBadge).toHaveBeenCalledWith(null);
  });

  it("renders the owner-only extras and speaks in the first person", () => {
    renderView({
      owner: true,
      children: <div data-testid="owner-extra" />,
      headerAction: <button type="button">Sign out</button>,
    });

    expect(screen.getByTestId("owner-extra")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "My record" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "My games" })).toBeInTheDocument();
  });

  it("carries no caveat on your own page", () => {
    renderView({ owner: true });
    expect(screen.queryByTestId("stats-caveat")).toBeNull();
  });
});

describe("ProfileView — read-only mode", () => {
  it("has no badge control at all, locked or unlocked", () => {
    renderView({ owner: false });

    const unlocked = badgeTile("first-win");
    expect(unlocked.tagName).not.toBe("BUTTON");
    expect(within(unlocked).queryByRole("button")).toBeNull();
    fireEvent.click(unlocked);
    expect(selectBadge).not.toHaveBeenCalled();
    // Still legible: the case shows what is worn, it just can't be changed.
    expect(unlocked).toHaveAttribute("data-selected", "true");
  });

  it("names the player instead of saying 'my', and states the caveat", () => {
    renderView({ owner: false, username: "Emyrk", subtitle: "Unbrewed player" });

    // By role: "Games" is also a stat tile's label, and the heading is the
    // thing that changes between the two modes.
    expect(screen.getByRole("heading", { name: "Record" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Games" })).toBeInTheDocument();
    expect(screen.queryByText("My record")).toBeNull();
    expect(screen.getByText(/Every finished Pro game Emyrk played/)).toBeInTheDocument();
    expect(screen.getByTestId("stats-caveat")).toHaveTextContent(
      /numbers are for fun/i,
    );
  });
});
