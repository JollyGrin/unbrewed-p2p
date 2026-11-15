/**
 * The post-game "Next up" strip (p2p #1657): held data draws it at once, the
 * landed poll re-ranks it, the unlock row deep-links to /collection and lights
 * the nav dot, a guest gets one sign-in row, and nothing to say renders nothing.
 */
import "@testing-library/jest-dom";
import { render, screen, within } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { emptyHeroCosmetics } from "@/lib/account/cosmetics";
import type { AccountStats } from "@/lib/account/stats";
import { UPGRADES_SEEN_KEY, __resetUpgradeSeenForTest, hasUnseenUpgrade, parseUpgradeSeen } from "@/lib/collection/upgradeSeen";
import type { EarnedSnapshot } from "@/lib/pro/earned";
import type { EarnedLanded, GameEarnedView } from "@/lib/pro/useGameEarned";
import { NextUpHeld, ProPostGameNextUp } from "./ProPostGameNextUp";

jest.mock("next/router", () => ({ useRouter: () => ({ asPath: "/pro/game" }) }));

const before: EarnedSnapshot = {
  stats: { totalGames: 40, level: 7, xp: 3504, xpForNext: 3600, streak: 3, streakBest: 6 },
  heroId: "hollow-oak",
  heroPoints: 20,
  unlocked: [],
};

const landed = (over: Partial<EarnedLanded> = {}): EarnedLanded => ({
  phase: "landed",
  before,
  after: { totalGames: 41, level: 7, xp: 3560, xpForNext: 3600, streak: 4, streakBest: 6 },
  delta: { xp: 56, level: 7, levelUp: false, points: 40, heroPoints: 60, streak: { from: 3, to: 4 }, newBadges: [] },
  forfeit: false,
  thresholds: [250, 750, 2000, 5000],
  ...over,
});

const held = (over: Partial<NextUpHeld> = {}): NextUpHeld => ({
  heroId: "hollow-oak",
  cosmeticHeroes: [{ ...emptyHeroCosmetics("hollow-oak", true), earned: 20, available: 20 }],
  cosmeticConstants: null,
  stats: { level: 7, xp: 3504, xpForNext: 3600 } as AccountStats,
  badges: [{ id: "regular", name: "Regular", blurb: "", unlocked: false, unlockedWhy: "Play 50 games (40/50)" }],
  ...over,
});

const draw = (props: { earned?: GameEarnedView | null; held?: NextUpHeld; status?: "signed-in" | "guest" | "offline"; victory?: boolean }) =>
  render(
    <ChakraProvider>
      <ProPostGameNextUp
        accountStatus={props.status ?? "signed-in"}
        held={props.held ?? held()}
        earned={props.earned ?? null}
        heroName="Hollow Oak"
        victory={props.victory ?? true}
        layout="panel"
      />
    </ChakraProvider>,
  );

const rowKinds = () => screen.getAllByTestId("next-up-row").map((row) => row.getAttribute("data-kind"));
const stored = () => parseUpgradeSeen(window.localStorage.getItem(UPGRADES_SEEN_KEY));

beforeEach(() => {
  window.localStorage.clear();
  __resetUpgradeSeenForTest();
});

it("draws from held data before the poll lands: nearest goals, no unlock, no dot", () => {
  draw({ earned: { phase: "waiting", before, forfeit: false, thresholds: [] } });
  // level 7: (3504 − 2800) / 800 = 88%; badge 80%; card 20/50 = 40%; rim 8%.
  expect(rowKinds()).toEqual(["level", "badge", "card"]);
  expect(screen.getByText("96 XP to level 8")).toBeInTheDocument();
  expect(screen.getByText("30 points to a Bronze card")).toBeInTheDocument();
  expect(screen.queryByTestId("next-up-upgrade")).toBeNull();
  expect(hasUnseenUpgrade(stored())).toBe(false);
});

it("the landed game makes Bronze affordable: the unlock leads, links to the hero, and lights the nav dot", () => {
  draw({ earned: landed() });
  expect(rowKinds()).toEqual(["unlock", "level", "badge"]);
  const unlock = screen.getAllByTestId("next-up-row")[0];
  expect(unlock).toHaveTextContent("Upgrade available: Bronze on Hollow Oak");
  expect(within(unlock).getByTestId("next-up-upgrade")).toHaveAttribute("href", "/collection?hero=hollow-oak");
  // The win paid 56 XP and 40 are left: one more like it.
  expect(screen.getByText("One more win to level 8")).toBeInTheDocument();
  expect(stored().affordable).toEqual({ "hollow-oak": 1 });
  expect(hasUnseenUpgrade(stored())).toBe(true);
});

it("a loser sees the same strip, without the 'one more win' claim", () => {
  draw({ earned: landed(), victory: false });
  expect(rowKinds()).toEqual(["unlock", "level", "badge"]);
  expect(screen.getByText("40 XP to level 8")).toBeInTheDocument();
});

it("a casual game (no poll) still ranks from what the page holds", () => {
  draw({ earned: { phase: "casual" } });
  expect(rowKinds()).toEqual(["level", "badge", "card"]);
});

it("a guest sees one row pointing at sign-in", () => {
  draw({ status: "guest" });
  expect(rowKinds()).toEqual(["sign-in"]);
  expect(screen.getByTestId("next-up-sign-in")).toHaveAttribute("href", expect.stringContaining("/auth/discord"));
});

it("nothing to show renders nothing", () => {
  draw({
    held: { heroId: "hollow-oak", cosmeticHeroes: [], cosmeticConstants: null, stats: null, badges: [] },
  });
  expect(screen.queryByTestId("post-game-next-up")).toBeNull();
  expect(screen.queryByTestId("next-up-row")).toBeNull();
});

it("accounts unreachable → nothing, not a sign-in row", () => {
  draw({ status: "offline" });
  expect(screen.queryByTestId("post-game-next-up")).toBeNull();
});
