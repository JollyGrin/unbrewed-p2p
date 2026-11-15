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
import type { HeroListing } from "@/lib/pro/protocol";
import type { FinishedGameSetup } from "@/lib/pro/rematch";
import type { EarnedLanded, GameEarnedView } from "@/lib/pro/useGameEarned";
import { NextUpHeld, ProPostGameNextUp } from "./ProPostGameNextUp";

jest.mock("next/router", () => ({ useRouter: () => ({ asPath: "/pro/game" }) }));

const before: EarnedSnapshot = {
  stats: { totalGames: 40, level: 7, xp: 3504, xpForNext: 3600, streak: 3, streakBest: 6, playedHeroes: ["hollow-oak"], bonuses: null, daily: null },
  heroId: "hollow-oak",
  heroPoints: 20,
  unlocked: [],
};

const landed = (over: Partial<EarnedLanded> = {}): EarnedLanded => ({
  phase: "landed",
  before,
  after: { totalGames: 41, level: 7, xp: 3560, xpForNext: 3600, streak: 4, streakBest: 6, playedHeroes: ["hollow-oak"], bonuses: null, daily: null },
  delta: { xp: 56, level: 7, levelUp: false, points: 40, heroPoints: 60, streak: { from: 3, to: 4 }, newBadges: [], bonuses: [] },
  forfeit: false,
  practice: false,
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
  draw({ earned: { phase: "waiting", before, forfeit: false, practice: false, thresholds: [] } });
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
  draw({ earned: { phase: "casual", practiceCap: null } });
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

// --- what to play next (p2p #1659) -------------------------------------------

const listing = (heroId: string, name: string, over: Partial<HeroListing> = {}): HeroListing => ({
  heroId,
  name,
  hp: 14,
  move: 2,
  reach: "MELEE",
  tier: "spice",
  deckSection: "recommended",
  botTiers: ["easy", "medium", "hard", "expert"],
  ...over,
});

const ROSTER = [
  listing("hollow-oak", "Hollow Oak"),
  listing("thetis", "Thetis"),
  listing("fan-deck", "Fan Deck", { deckSection: "community", tier: "community" }),
  listing("batman", "Batman"),
];

const botGame = (bot: "easy" | "medium" | "hard" | "expert" | null): FinishedGameSetup => ({
  formatId: "duel",
  itemsWereOff: false,
  mapId: null,
  turnTimerSeconds: 0,
  mulliganWasOn: true,
  yourHeroId: "hollow-oak",
  otherSeats: [{ player: "p2", heroId: "thetis", bot }],
});

const stats = (over: Partial<AccountStats> = {}): AccountStats =>
  ({ totalGames: 40, level: 7, xp: 3000, xpForNext: 3600, byHero: [], byOpponentKind: null, bonuses: null, ...over }) as AccountStats;

/** Nothing near: level 25%, no hero points, no badges — so the suggestions lead. */
const quiet = (over: Partial<NextUpHeld> = {}): NextUpHeld =>
  held({ cosmeticHeroes: [], stats: stats(), badges: [], ...over });

const row = (kind: string) => screen.getAllByTestId("next-up-row").find((el) => el.getAttribute("data-kind") === kind);

it("a win vs the easy bot offers a one-tap rematch one tier up", () => {
  draw({ held: quiet({ setup: botGame("easy"), roster: ROSTER }) });
  expect(rowKinds()[0]).toBe("ladder");
  expect(row("ladder")).toHaveTextContent("Ready for the Medium bot?");
  const play = within(row("ladder")!).getByTestId("next-up-ladder");
  expect(play).toHaveAttribute("href", "/pro/game?rematch=1&hero=hollow-oak&bots=p2%3Amedium%3Athetis");
  expect(play).not.toHaveAttribute("target");
});

it("no ladder after a loss", () => {
  draw({ held: quiet({ setup: botGame("easy"), roster: ROSTER }), victory: false });
  expect(rowKinds()).not.toContain("ladder");
});

it("practice cap used up: the row points at hard and says XP continues there", () => {
  const spent = { firstGame: null, daily: null, practice: { cap: 5, used: 5, xpPerGame: 10, xpPerWin: 5, xp: 60 } };
  draw({ held: quiet({ setup: botGame("easy"), roster: ROSTER, stats: stats({ bonuses: spent }) }) });
  expect(row("ladder")).toHaveTextContent("Ready for the Hard bot?");
  expect(row("ladder")).toHaveTextContent("Practice XP is used up. Hard bots are where XP continues.");
  expect(within(row("ladder")!).getByTestId("next-up-ladder")).toHaveAttribute("href", expect.stringContaining("p2%3Ahard%3Athetis"));
});

it("the landed game's own practice count is the one that decides", () => {
  const used = (n: number) => ({ firstGame: null, daily: null, practice: { cap: 5, used: n, xpPerGame: 10, xpPerWin: 5, xp: n * 10 } });
  draw({
    held: quiet({ setup: botGame("medium"), roster: ROSTER, stats: stats({ bonuses: used(4) }) }),
    earned: landed({ after: { ...landed().after, bonuses: used(5) } }),
  });
  expect(row("ladder")).toHaveTextContent("Practice XP is used up.");
});

it("a hard win only climbs when the server serves expert for both heroes", () => {
  const noExpert = ROSTER.map((hero) => (hero.heroId === "thetis" ? { ...hero, botTiers: ["easy", "medium", "hard"] as HeroListing["botTiers"] } : hero));
  const { unmount } = draw({ held: quiet({ setup: botGame("hard"), roster: noExpert }) });
  expect(rowKinds()).not.toContain("ladder");
  unmount();
  draw({ held: quiet({ setup: botGame("hard"), roster: ROSTER }) });
  expect(row("ladder")).toHaveTextContent("Ready for the Expert bot?");
});

it("expert wins show progress toward the hidden bot; an unlocked player sees none", () => {
  const record = stats({ byOpponentKind: { human: null, bots: [{ difficulty: "expert", games: 20, wins: 9 }] } } as Partial<AccountStats>);
  const { unmount } = draw({ held: quiet({ stats: record }) });
  expect(row("hidden-bot")).toHaveTextContent("9/15 expert wins");
  unmount();
  draw({ held: quiet({ stats: record, hiddenBotUnlocked: true }) });
  expect(rowKinds()).not.toContain("hidden-bot");
});

it("an expert win the held record predates is counted once the poll lands", () => {
  const record = stats({ byOpponentKind: { human: null, bots: [{ difficulty: "expert", games: 20, wins: 9 }] } } as Partial<AccountStats>);
  draw({ held: quiet({ stats: record, setup: botGame("expert"), roster: ROSTER }), earned: landed() });
  expect(row("hidden-bot")).toHaveTextContent("10/15 expert wins");
});

it("suggests a maintained hero never piloted, one tap from a bot game as it", () => {
  draw({
    held: quiet({
      roster: ROSTER,
      setup: botGame("easy"),
      // thetis has points, so it has a game; the fan deck is not a suggestion.
      cosmeticHeroes: [{ ...emptyHeroCosmetics("thetis", true), earned: 50, available: 0 }],
      cosmeticConstants: { cardTierCosts: [50, 150, 400, 1000], tokenRimThresholds: [250, 750, 2000, 5000], heroFirstGamePoints: 50 },
    }),
  });
  expect(row("new-hero")).toHaveTextContent("Try Batman");
  expect(row("new-hero")).toHaveTextContent("First game as a new hero pays +50 points");
  const play = within(row("new-hero")!).getByTestId("next-up-new-hero");
  expect(play).toHaveAttribute("href", "/pro/game?rematch=1&hero=batman&bots=p2%3Aeasy%3A");
  expect(play).not.toHaveAttribute("target");
});

it("after a game with a human the new-hero game opens beside the table", () => {
  draw({
    held: quiet({
      roster: ROSTER,
      setup: botGame(null),
      cosmeticConstants: { cardTierCosts: [50, 150, 400, 1000], tokenRimThresholds: [250, 750, 2000, 5000], heroFirstGamePoints: 50 },
    }),
  });
  const play = within(row("new-hero")!).getByTestId("next-up-new-hero");
  expect(play).toHaveAttribute("href", "/pro/game?rematch=1&hero=thetis&bots=p2%3Amedium%3A");
  expect(play).toHaveAttribute("target", "_blank");
});

it("no new-hero row without the api's first-game points, or when a hero's points are unknown", () => {
  const { unmount } = draw({ held: quiet({ roster: ROSTER }) });
  expect(rowKinds()).not.toContain("new-hero");
  unmount();
  draw({
    held: quiet({
      roster: [listing("hollow-oak", "Hollow Oak"), listing("thetis", "Thetis")],
      cosmeticHeroes: [emptyHeroCosmetics("thetis", false)],
      cosmeticConstants: { cardTierCosts: [50], tokenRimThresholds: [250], heroFirstGamePoints: 50 },
    }),
  });
  expect(rowKinds()).not.toContain("new-hero");
});

it("a guest still sees only the sign-in row", () => {
  draw({ status: "guest", held: quiet({ setup: botGame("easy"), roster: ROSTER }) });
  expect(rowKinds()).toEqual(["sign-in"]);
});
