/**
 * A HERO's defeat REPLACED by a revive (William Afton → Springtrap, issue #1530):
 * the SAME fighter comes back renamed on a new dial in the same space, with no
 * defeat event for the first form. Every surface that diffs two snapshots of a
 * fighter — the feed (gameLog), the board FX (fxEvents) and the post-game stats
 * (gameStats) — detects it with this one predicate, so they can never disagree
 * about which batch held the revive.
 *
 * Keyed on a HERO alive in the earlier snapshot whose name AND max HP both
 * changed (the revive writes both). Whether the new form is still standing does
 * not matter: enough further damage in the same window can defeat it before the
 * next snapshot. A SIDEKICK revive (Robin Hood) keeps its own name and dial, so
 * it never matches.
 */
import type { ViewFighter } from "./protocol";

type ReviveFields = Pick<ViewFighter, "kind" | "name" | "maxHp" | "defeated">;

export const isHeroRevive = (was: ReviveFields, now: ReviveFields): boolean =>
  now.kind === "HERO" && !was.defeated && now.name !== was.name && now.maxHp !== was.maxHp;
