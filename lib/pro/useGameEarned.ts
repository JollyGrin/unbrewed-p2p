/**
 * The post-game "What you earned" poll (p2p #1399, feature/end-screen part 3).
 *
 * On game end, for a signed-in player in a counted game: snapshot what the
 * page already holds (the pre-game `/me/stats`, the played hero's cosmetic
 * points, the unlocked badge set), then refetch `/me/stats` on a bounded
 * cadence until the api has visibly counted this game (`totalGames` ticks
 * up), then refetch cosmetics and badges ONCE and hand the deltas to the card.
 *
 * Bounded on purpose: every 5 s for at most ~2 min. The engine submits
 * telemetry at game end and the api serves `/me/stats` from a ~60 s cache, so
 * a lag of seconds to a minute is the normal case and two minutes is the
 * point past which polling is just load. Giving up is a calm state ("still
 * recording"), never an error — the profile page will show the numbers later.
 *
 * Casual tiers (easy/medium bots) never poll: nothing is granted for them.
 * Guests never reach this hook's poll either — the page only passes
 * `signedIn` for a real account, and the panel renders its own guest line.
 */
import { useEffect, useRef, useState } from "react";

import type { AccountStats, StatsResult } from "@/lib/account/stats";
import { fetchAccountStats } from "@/lib/account/stats";
import type { Badge } from "@/lib/account/badges";
import type { CosmeticConstants, CosmeticsResult, HeroCosmetics } from "@/lib/account/cosmetics";
import { FALLBACK_CONSTANTS, fetchCosmetics } from "@/lib/account/cosmetics";
import { reprobeBadges } from "@/lib/account/useBadges";

import {
  EarnedDelta,
  EarnedKind,
  EarnedSnapshot,
  EarnedStats,
  earnedDelta,
  earnedStatsOf,
  gameHasLanded,
  takeEarnedSnapshot,
  unlockedBadgeIds,
} from "./earned";

// --- the poll, as a plain function so its stop conditions are testable ------

export interface EarnedPollDeps {
  fetchStats: () => Promise<StatsResult>;
  fetchCosmetics: () => Promise<CosmeticsResult>;
  reprobeBadges: () => Promise<Badge[] | null>;
  /** Gap between `/me/stats` refetches. */
  intervalMs: number;
  /** Refetches before giving up — the first fires immediately, so 24 × 5 s ≈ 2 min. */
  maxAttempts: number;
}

export const DEFAULT_EARNED_POLL: EarnedPollDeps = {
  fetchStats: fetchAccountStats,
  fetchCosmetics,
  reprobeBadges,
  intervalMs: 5_000,
  maxAttempts: 24,
};

/** A cancellation token: the owning effect flips it on cleanup. */
export interface PollToken {
  cancelled: boolean;
}

// A cancel mid-sleep lets the timer fire into a loop that checks the token on
// wake and stops — one spare 5 s timer, no listener to clean up.
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Refetch stats until the game lands, the attempts run out, or the token is
 * cancelled. Resolves with the landed stats, or null for the other two —
 * the caller tells them apart by the token.
 *
 * A failed fetch (503, offline) counts as an attempt and the loop carries
 * on: the api being briefly unreachable right after a game is exactly the
 * window this poll exists for.
 */
export const pollUntilLanded = async (
  before: Pick<EarnedStats, "totalGames">,
  deps: Pick<EarnedPollDeps, "fetchStats" | "intervalMs" | "maxAttempts">,
  token: PollToken,
): Promise<AccountStats | null> => {
  for (let attempt = 1; attempt <= deps.maxAttempts; attempt++) {
    if (token.cancelled) return null;
    const result = await deps.fetchStats();
    if (token.cancelled) return null;
    if (result.ok && gameHasLanded(before, result.value)) return result.value;
    if (attempt === deps.maxAttempts) return null;
    await sleep(deps.intervalMs);
  }
  return null;
};

/** What a landed poll hands back once cosmetics and badges were re-read. */
export interface EarnedAfter {
  stats: EarnedStats;
  heroPoints: number | null;
  unlocked: string[];
  thresholds: number[];
}

/**
 * Cosmetics and badges, once, after the stats landed. Either failing is a
 * null — "unknown", which the card says rather than inventing a zero — and
 * a failed badge probe diffs as "no new badge" against the baseline.
 */
export const readAfterLanding = async (
  landed: AccountStats,
  before: EarnedSnapshot,
  deps: Pick<EarnedPollDeps, "fetchCosmetics" | "reprobeBadges">,
  fallbackThresholds: number[],
): Promise<EarnedAfter> => {
  const [cosmetics, badges] = await Promise.all([deps.fetchCosmetics(), deps.reprobeBadges()]);
  const payload = cosmetics.ok ? cosmetics.value : cosmetics.degraded;
  const hero = payload?.heroes.find((row) => row.heroId === before.heroId) ?? null;
  // A hero the api didn't mention in a GOOD payload has earned nothing yet
  // (the same reading `useCosmetics.heroFor` makes); in a degraded one it is
  // unknown.
  const heroPoints = hero ? hero.earned : cosmetics.ok ? 0 : null;
  return {
    stats: earnedStatsOf(landed),
    heroPoints,
    unlocked: badges ? unlockedBadgeIds(badges) : before.unlocked,
    thresholds: payload?.constants.tokenRimThresholds ?? fallbackThresholds,
  };
};

// --- the hook ----------------------------------------------------------------

export interface GameEarnedInput {
  /** The room the game is in; everything resets when it changes. */
  roomId: string | null;
  /** True once this room's game is over — the trigger. */
  gameOver: boolean;
  /** Only a real account polls; guests get the panel's own line. */
  signedIn: boolean;
  /** Casual vs counted (+ forfeit), from `earnedKindOf`; null while unknown. */
  kind: EarnedKind | null;
  /** The hero you played. */
  heroId: string | null;
  /** The pre-game `/me/stats`, as `useAccountStats` holds it. */
  stats: AccountStats | null;
  /** The pre-game cosmetics, as the socket's `useCosmetics` holds them. */
  cosmeticHeroes: HeroCosmetics[];
  /** The api's ladder; null falls back to the client's copy of it. */
  cosmeticConstants: CosmeticConstants | null;
  /** The badge case, as `useBadges` holds it. */
  badges: Badge[];
}

/** Counting (`waiting`), or counted out (`timeout`): the baseline is all the card has. */
export interface EarnedPending {
  phase: "waiting" | "timeout";
  before: EarnedSnapshot;
  forfeit: boolean;
  thresholds: number[];
}

/** The refetch caught up: the deltas are real. */
export interface EarnedLanded {
  phase: "landed";
  before: EarnedSnapshot;
  after: EarnedStats;
  delta: EarnedDelta;
  forfeit: boolean;
  thresholds: number[];
}

export type GameEarnedView =
  | { phase: "casual" }
  /** Signed in, but no pre-game stats to diff against: one quiet line. */
  | { phase: "no-baseline" }
  | EarnedPending
  | EarnedLanded;

type Phase =
  | { phase: "idle" }
  | { phase: "casual" }
  | { phase: "no-baseline" }
  | { phase: "waiting" | "timeout"; before: EarnedSnapshot; thresholds: number[] }
  | { phase: "landed"; before: EarnedSnapshot; after: EarnedStats; delta: EarnedDelta; thresholds: number[] };

export const useGameEarned = (input: GameEarnedInput, deps: EarnedPollDeps = DEFAULT_EARNED_POLL): GameEarnedView | null => {
  const [state, setState] = useState<Phase>({ phase: "idle" });
  // The baseline is read through refs at the moment the game ends: these
  // inputs change on their own schedule (the stats fetch, a cosmetics pref
  // flip) and none of them should restart a poll that is already running.
  const inputRef = useRef(input);
  inputRef.current = input;
  const depsRef = useRef(deps);
  depsRef.current = deps;
  // The last stats this hook saw land. A rematch on the same page starts
  // its next game from these, not from the page-load fetch, so the second
  // game's delta is its own and not both games' together.
  const landedStatsRef = useRef<AccountStats | null>(null);

  const { roomId, gameOver, signedIn, heroId } = input;
  const kindKey = input.kind?.kind ?? null;

  useEffect(() => {
    setState({ phase: "idle" });
  }, [roomId]);

  useEffect(() => {
    if (!roomId || !gameOver || !signedIn || !kindKey) return;
    if (kindKey === "casual") {
      setState({ phase: "casual" });
      return;
    }
    const current = inputRef.current;
    const baseline = landedStatsRef.current ?? current.stats;
    const hero = current.cosmeticHeroes.find((row) => row.heroId === heroId) ?? null;
    const before = takeEarnedSnapshot(baseline, heroId, hero, current.badges);
    if (!before) {
      setState({ phase: "no-baseline" });
      return;
    }
    const thresholds = current.cosmeticConstants?.tokenRimThresholds ?? FALLBACK_CONSTANTS.tokenRimThresholds;
    setState({ phase: "waiting", before, thresholds });
    const token: PollToken = { cancelled: false };
    const poll = depsRef.current;
    void pollUntilLanded(before.stats, poll, token).then(async (landed) => {
      if (token.cancelled) return;
      if (!landed) {
        setState({ phase: "timeout", before, thresholds });
        return;
      }
      landedStatsRef.current = landed;
      const after = await readAfterLanding(landed, before, poll, thresholds);
      if (token.cancelled) return;
      setState({ phase: "landed", before, after: after.stats, delta: earnedDelta(before, after), thresholds: after.thresholds });
    });
    return () => {
      token.cancelled = true;
    };
  }, [roomId, gameOver, signedIn, kindKey, heroId]);

  if (state.phase === "idle") return null;
  if (state.phase === "casual" || state.phase === "no-baseline") return state;
  const forfeit = input.kind?.kind === "counted" && input.kind.forfeit;
  return { ...state, forfeit };
};
