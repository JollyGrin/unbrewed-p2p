/**
 * DEV gallery for the post-game "What you earned" card (issue #1670): the card
 * at panel width and at the in-game HUD's compact size, against hand-written
 * views, with a button that replays the landing (waiting, then a NEW landed
 * delta, which is what makes the animation play again).
 *
 * `?s=<scenario>` picks the scenario; `?still=1` mounts it already landed.
 * Nothing here talks to an api.
 */
import { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { Box, Button, Flex, Text } from "@chakra-ui/react";

import { ProPostGameEarned } from "@/components/Pro/ProPostGameEarned";
import type { DailyStats, StatsBonuses } from "@/lib/account/bonuses";
import type { EarnedSnapshot } from "@/lib/pro/earned";
import type { EarnedLanded, GameEarnedView } from "@/lib/pro/useGameEarned";

const thresholds = [250, 750, 2000, 5000];

const daily: DailyStats = {
  streak: 3,
  bestStreak: 4,
  playedToday: true,
  wonToday: true,
  playXpToday: 20,
  playXpTomorrow: 25,
  firstWinXp: 20,
  resetsAt: "2026-11-17T00:00:00.000Z",
};

const bonuses = (used: number): StatsBonuses => ({
  firstGame: { xp: 100, earned: true },
  practice: { cap: 5, used, xpPerGame: 15, xpPerWin: 0, xp: used * 15 },
  daily: null,
});

const snapshot = (level: number, xp: number, xpForNext: number): EarnedSnapshot => ({
  stats: { totalGames: 0, level, xp, xpForNext, streak: 0, streakBest: 0, playedHeroes: [], bonuses: null, daily: null },
  heroId: "hollow-oak",
  heroPoints: 0,
  unlocked: [],
});

type Scenario = "first-win" | "counted" | "level-up" | "practice-spent" | "no-xp";

const SCENARIOS: Scenario[] = ["first-win", "counted", "level-up", "practice-spent", "no-xp"];

/** A fresh landed view each call: a new `delta` is a new landing. */
const landedView = (scenario: Exclude<Scenario, "no-xp">): EarnedLanded => {
  switch (scenario) {
    case "first-win": {
      // Level 1 runs 100 → 300 XP: a new account at 100 lands on 275 (88%).
      const before = snapshot(1, 100, 300);
      return {
        phase: "landed",
        before,
        after: { ...before.stats, totalGames: 1, xp: 275, streak: 1, streakBest: 1, bonuses: bonuses(1), daily: { ...daily, streak: 1, playXpToday: 10, playXpTomorrow: 15 } },
        delta: {
          xp: 175,
          level: 1,
          levelUp: false,
          points: 50,
          heroPoints: 50,
          streak: { from: 0, to: 1 },
          newBadges: [],
          bonuses: [
            { kind: "first-game", xp: 100 },
            { kind: "practice", game: 1, cap: 5, xp: 15 },
            { kind: "hero-first", points: 50 },
            { kind: "daily", day: 1, xp: 10 },
            { kind: "first-win", xp: 20 },
            { kind: "quest", id: "first-win", title: "Win a game", xp: 30 },
          ],
        },
        forfeit: false,
        practice: true,
        thresholds,
      };
    }
    case "counted": {
      const before = { ...snapshot(7, 2950, 3600), heroPoints: 220 };
      return {
        phase: "landed",
        before,
        after: { ...before.stats, totalGames: 41, xp: 3110, streak: 4, streakBest: 6, daily },
        delta: {
          xp: 160,
          level: 7,
          levelUp: false,
          points: 40,
          heroPoints: 260,
          streak: { from: 3, to: 4 },
          newBadges: [],
          bonuses: [
            { kind: "daily", day: 3, xp: 20 },
            { kind: "first-win", xp: 20 },
          ],
        },
        forfeit: false,
        practice: false,
        thresholds,
      };
    }
    case "level-up": {
      const before = { ...snapshot(7, 3504, 3600), heroPoints: 220 };
      return {
        phase: "landed",
        before,
        after: { ...before.stats, totalGames: 41, level: 8, xp: 3840, xpForNext: 4500, streak: 4, streakBest: 6, daily },
        delta: {
          xp: 336,
          level: 8,
          levelUp: true,
          points: 40,
          heroPoints: 260,
          streak: { from: 3, to: 4 },
          newBadges: ["first-win"],
          bonuses: [{ kind: "daily", day: 3, xp: 20 }],
        },
        forfeit: false,
        practice: false,
        thresholds,
      };
    }
    case "practice-spent": {
      const before = { ...snapshot(2, 420, 600), heroPoints: 120 };
      return {
        phase: "landed",
        before,
        after: { ...before.stats, totalGames: 9, xp: 450, bonuses: bonuses(5), daily },
        delta: {
          xp: 30,
          level: 2,
          levelUp: false,
          points: 0,
          heroPoints: 120,
          streak: null,
          newBadges: [],
          bonuses: [
            { kind: "daily", day: 3, xp: 10 },
            { kind: "first-win", xp: 20 },
          ],
        },
        forfeit: false,
        practice: true,
        thresholds,
      };
    }
  }
};

const viewFor = (scenario: Scenario, phase: "waiting" | "landed"): GameEarnedView => {
  if (scenario === "no-xp") return { phase: "casual", practiceCap: 5 };
  const landed = landedView(scenario);
  return phase === "landed" ? landed : { phase: "waiting", before: landed.before, forfeit: false, practice: landed.practice, thresholds };
};

export default function PostGameEarnedDevPage() {
  const router = useRouter();
  const [scenario, setScenario] = useState<Scenario>("first-win");
  const [view, setView] = useState<GameEarnedView | null>(null);

  // The query decides the first view, once the router can read it.
  useEffect(() => {
    if (!router.isReady) return;
    const asked = SCENARIOS.find((s) => s === router.query.s) ?? "first-win";
    setScenario(asked);
    setView(viewFor(asked, router.query.still ? "landed" : "waiting"));
  }, [router.isReady, router.query.s, router.query.still]);

  const pick = (next: Scenario) => {
    setScenario(next);
    setView(viewFor(next, "waiting"));
  };
  const land = () => setView(viewFor(scenario, "landed"));

  return (
    <>
      <Head>
        <title>Post-game earned card (dev)</title>
        <meta name="robots" content="noindex" />
      </Head>
      <Box bg="brand.surfaceDim" minH="100vh" color="brand.parchment" fontFamily="SpaceGrotesk" p="1.5rem">
        <Flex gap="0.5rem" flexWrap="wrap" mb="1.25rem" align="center">
          {SCENARIOS.map((s) => (
            <Button key={s} size="sm" onClick={() => pick(s)} aria-pressed={scenario === s} variant={scenario === s ? "solid" : "outline"} data-testid={`scenario-${s}`}>
              {s}
            </Button>
          ))}
          <Button size="sm" onClick={() => pick(scenario)} data-testid="reset">
            Back to counting
          </Button>
          <Button size="sm" onClick={land} data-testid="land">
            Land the game
          </Button>
        </Flex>
        {view && (
          <Flex gap="2rem" flexWrap="wrap" align="flex-start">
            <Box w="30rem" maxW="100%" data-frame="panel">
              <Text fontSize="0.7rem" opacity={0.6} mb="0.4rem">
                panel
              </Text>
              <ProPostGameEarned view={view} heroName="Hollow Oak" />
            </Box>
            <Box w="20rem" maxW="100%" data-frame="compact">
              <Text fontSize="0.7rem" opacity={0.6} mb="0.4rem">
                compact (in-game HUD)
              </Text>
              <ProPostGameEarned view={view} heroName="Hollow Oak" compact />
            </Box>
          </Flex>
        )}
      </Box>
    </>
  );
}
