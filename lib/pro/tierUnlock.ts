/**
 * The `jevx3` unlock gate (#933): a signed-in player needs 15 recorded wins vs
 * the `expert` tier before they may PICK `jevx3` in the create screen.
 *
 * Frontend-only, by decision — there is no server enforcement in this phase, and
 * the gate is only on choosing the tier. Joining, reconnecting to or spectating a
 * room that already has a `jevx3` seat is never checked.
 *
 * Every state that is not a confirmed record of >= 15 wins fails CLOSED: guests,
 * a stats request still in flight, a failed request and an API that doesn't send
 * `byOpponentKind` all leave the chip locked. The server still decides whether
 * the chip appears at all (`HeroListing.botTiers`, see ./botTiers.ts); this
 * module only ever narrows what it offers.
 */
import type { AccountStats } from "../account/stats";
import type { AccountStatsStatus } from "../account/useAccountStats";

import type { BotTierChoice } from "./botTiers";
import type { BotDifficulty } from "./protocol";

export const TIER_UNLOCK = {
  tier: "jevx3",
  requires: "expert",
  wins: 15,
} as const satisfies { tier: BotDifficulty; requires: BotDifficulty; wins: number };

export interface TierUnlockProgress {
  unlocked: boolean;
  /** Recorded wins vs the required tier; null when we don't have a record. */
  wins: number | null;
  /** Player-facing reason, set whenever `unlocked` is false. */
  hint?: string;
}

export const GUEST_HINT = `Sign in and win ${TIER_UNLOCK.wins} vs Expert to unlock`;
export const LOADING_HINT = `Win ${TIER_UNLOCK.wins} vs Expert to unlock`;
export const UNAVAILABLE_HINT = `Couldn't load your record · win ${TIER_UNLOCK.wins} vs Expert to unlock`;
export const progressHint = (wins: number) => `${wins}/${TIER_UNLOCK.wins} wins vs Expert to unlock`;

/** Wins vs Expert on the record; an absent `byOpponentKind` counts as zero. */
export const winsVsRequired = (stats: AccountStats | null): number =>
  stats?.byOpponentKind?.bots.find((b) => b.difficulty === TIER_UNLOCK.requires)?.wins ?? 0;

export function tierUnlockProgress(status: AccountStatsStatus, stats: AccountStats | null): TierUnlockProgress {
  switch (status) {
    case "guest":
    case "offline":
      return { unlocked: false, wins: null, hint: GUEST_HINT };
    case "loading":
      return { unlocked: false, wins: null, hint: LOADING_HINT };
    case "unavailable":
      return { unlocked: false, wins: null, hint: UNAVAILABLE_HINT };
    case "ready": {
      if (!stats) return { unlocked: false, wins: null, hint: UNAVAILABLE_HINT };
      const wins = winsVsRequired(stats);
      return wins >= TIER_UNLOCK.wins ? { unlocked: true, wins } : { unlocked: false, wins, hint: progressHint(wins) };
    }
  }
}

/** The tiers this player may not pick right now — for pruning armed seats. */
export const lockedTiers = (progress: TierUnlockProgress): BotDifficulty[] =>
  progress.unlocked ? [] : [TIER_UNLOCK.tier];

/** Mark the gated choice locked (with its hint); every other choice is untouched. */
export function applyTierLocks(choices: BotTierChoice[], progress: TierUnlockProgress): BotTierChoice[] {
  if (progress.unlocked) return choices;
  return choices.map((c) => (c.id === TIER_UNLOCK.tier ? { ...c, locked: true, lockHint: progress.hint } : c));
}
