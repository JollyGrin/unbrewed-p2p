/**
 * "Next up" — what is within reach after this game (p2p #1657, onboarding).
 *
 * The post-game panel says what a game earned; this says what the NEXT one is
 * for. Up to three rows, best first:
 *
 *   1. an upgrade the played hero's available points already afford;
 *   2. the nearest goals, closest first — points to the next card tier, points
 *      to the next token rim, XP to the next level, the nearest locked badge.
 *
 * Like `earned.ts`, nothing here invents a number. Every row is arithmetic on
 * what the accounts api already answered (`/me/cosmetics`, `/me/stats`,
 * `/me/badges`); the economy's prices and thresholds are the api's own
 * `constants`, never a copy. A source that did not arrive contributes no row,
 * and no sources at all is an empty list — the strip renders nothing.
 *
 * "How close" is one scale for every goal: the fraction of the CURRENT step
 * already covered (points toward this card's price, earned points between two
 * rim thresholds, XP within the level, a badge's own `(12/25)`). That is what
 * lets a level bar and a badge counter be ranked against each other at all.
 */
import type { Badge } from "@/lib/account/badges";
import type { CosmeticConstants, HeroCosmetics } from "@/lib/account/cosmetics";
import { emptyHeroCosmetics, rimProgress, rimTierName } from "@/lib/account/cosmetics";
import type { AccountStats } from "@/lib/account/stats";
import { levelProgress } from "@/lib/account/stats";
import { COSMETIC_RIM_PAINTS } from "@/lib/pro/cosmetics";

/** How many rows the strip ever shows. */
export const NEXT_UP_LIMIT = 3;

/** A goal's shared ranking fields. `progress` is 0–1 through the current step. */
interface Goal {
  toGo: number;
  progress: number;
}

export type NextUpRow =
  /** A guest's only row. */
  | { kind: "sign-in" }
  /** Points in hand already cover the next tier of a card. `tier` is the tier it buys. */
  | { kind: "unlock"; heroId: string; tier: number }
  | ({ kind: "card"; heroId: string; tier: number } & Goal)
  | ({ kind: "rim"; heroId: string; tier: number } & Goal)
  | ({ kind: "level"; level: number; oneMoreWin: boolean } & Goal)
  | ({ kind: "badge"; id: string; name: string; current: number; target: number } & Goal);

export type NextUpGoal = Exclude<NextUpRow, { kind: "sign-in" } | { kind: "unlock" }>;

// --- card tiers --------------------------------------------------------------

/**
 * The tiers this hero's cards currently sit at — each one a place a next step
 * could be bought from.
 *
 * `cardKeys` is the deck's own card list when the caller has it (/collection
 * does). Without it there is no way to know whether an un-upgraded card is
 * left, and the answer assumed is "yes": a deck has a dozen-odd card sets, so
 * a hero with every one of them already bought is the rare case, and the cost
 * of being wrong there is a hint that points at a card one tier too low.
 */
const currentCardTiers = (hero: HeroCosmetics, cardKeys?: readonly string[]): number[] => {
  const inDeck = cardKeys ? new Set(cardKeys) : null;
  const bought = hero.cards.filter((card) => !inDeck || inDeck.has(card.key));
  const tiers = new Set(bought.map((card) => card.tier));
  if (!inDeck || bought.length < inDeck.size) tiers.add(0);
  return [...tiers];
};

/**
 * The best tier this hero can buy right now on any card, or 0 for none.
 * "Best" is the highest tier: with a silver in reach, bronze is not the news.
 * Unknown points (a telemetry outage) afford nothing.
 */
export const affordableTier = (
  hero: HeroCosmetics,
  constants: CosmeticConstants,
  cardKeys?: readonly string[],
): number => {
  const { available } = hero;
  if (available === null) return 0;
  let best = 0;
  for (const tier of currentCardTiers(hero, cardKeys)) {
    const cost = constants.cardTierCosts[tier];
    if (cost !== undefined && available >= cost) best = Math.max(best, tier + 1);
  }
  return best;
};

/** The cheapest card step still out of reach — only asked when nothing is affordable. */
const cardGoal = (
  hero: HeroCosmetics,
  constants: CosmeticConstants,
  cardKeys?: readonly string[],
): NextUpGoal | null => {
  const { available } = hero;
  if (available === null) return null;
  let goal: { tier: number; cost: number } | null = null;
  for (const tier of currentCardTiers(hero, cardKeys)) {
    const cost = constants.cardTierCosts[tier];
    if (cost === undefined || cost <= available) continue;
    if (!goal || cost < goal.cost) goal = { tier: tier + 1, cost };
  }
  if (!goal) return null;
  return {
    kind: "card",
    heroId: hero.heroId,
    tier: goal.tier,
    toGo: goal.cost - available,
    progress: Math.max(0, available) / goal.cost,
  };
};

const rimGoal = (hero: HeroCosmetics, constants: CosmeticConstants): NextUpGoal | null => {
  const rim = rimProgress(hero.earned, constants.tokenRimThresholds);
  if (rim.tier === null || rim.toGo === null || rim.toGo <= 0) return null;
  return { kind: "rim", heroId: hero.heroId, tier: rim.tier + 1, toGo: rim.toGo, progress: rim.percent / 100 };
};

// --- level -------------------------------------------------------------------

const levelGoal = (
  stats: Pick<AccountStats, "level" | "xp" | "xpForNext"> | null,
  winXp: number | null,
): NextUpGoal | null => {
  const level = stats ? levelProgress(stats as AccountStats) : null;
  if (!level || level.toGo <= 0) return null;
  return {
    kind: "level",
    level: level.level + 1,
    toGo: level.toGo,
    progress: level.percent / 100,
    oneMoreWin: winXp !== null && winXp > 0 && winXp >= level.toGo,
  };
};

// --- badges ------------------------------------------------------------------

/**
 * `"Play 25 games (12/25)"` → `{ current: 12, target: 25 }`.
 *
 * The api sends a badge's requirement and progress as one human string; the
 * trailing `(n/m)` is the only machine-readable part of it. A badge without
 * one (a one-off feat) has no "how close", so it is never a row.
 */
export const badgeProgress = (unlockedWhy: string): { current: number; target: number } | null => {
  const match = /\(\s*([\d,]+)\s*\/\s*([\d,]+)\s*\)\s*$/.exec(unlockedWhy);
  if (!match) return null;
  const current = Number(match[1].replace(/,/g, ""));
  const target = Number(match[2].replace(/,/g, ""));
  if (!Number.isFinite(current) || !Number.isFinite(target) || target <= 0) return null;
  return { current, target };
};

/** The locked badge closest to unlocking; the catalog's order breaks a tie. */
const badgeGoal = (badges: readonly Badge[]): NextUpGoal | null => {
  let best: NextUpGoal | null = null;
  for (const badge of badges) {
    if (badge.unlocked) continue;
    const progress = badgeProgress(badge.unlockedWhy);
    if (!progress || progress.current >= progress.target) continue;
    const fraction = progress.current / progress.target;
    if (best && fraction <= best.progress) continue;
    best = {
      kind: "badge",
      id: badge.id,
      name: badge.name,
      current: progress.current,
      target: progress.target,
      toGo: progress.target - progress.current,
      progress: fraction,
    };
  }
  return best;
};

// --- the ranking -------------------------------------------------------------

export interface NextUpInput {
  /** A guest gets the sign-in row and nothing else. */
  guest: boolean;
  /** The played hero's standing AFTER this game, or null when it is unknown. */
  hero: HeroCosmetics | null;
  /** The api's ladder; null when no cosmetics payload ever arrived. */
  constants: CosmeticConstants | null;
  /** The level block of `/me/stats`, after this game when the poll has landed. */
  stats: Pick<AccountStats, "level" | "xp" | "xpForNext"> | null;
  /** XP a win like this one pays, when the page has seen one land; null = unknown. */
  winXp: number | null;
  badges: readonly Badge[];
  /** The deck's card keys, when known — see `currentCardTiers`. */
  cardKeys?: readonly string[];
}

/** Fixed order for equally-close goals, so the strip never reshuffles between renders. */
const TIE_ORDER: Record<NextUpGoal["kind"], number> = { card: 0, rim: 1, level: 2, badge: 3 };

/** Closest first; a tie falls to the fixed kind order. */
export const rankGoals = (goals: readonly NextUpGoal[]): NextUpGoal[] =>
  [...goals].sort((a, b) => b.progress - a.progress || TIE_ORDER[a.kind] - TIE_ORDER[b.kind]);

export const nextUpRows = (input: NextUpInput): NextUpRow[] => {
  if (input.guest) return [{ kind: "sign-in" }];
  const rows: NextUpRow[] = [];
  const goals: NextUpGoal[] = [];
  const { hero, constants } = input;
  if (hero && constants) {
    const tier = affordableTier(hero, constants, input.cardKeys);
    if (tier > 0) {
      rows.push({ kind: "unlock", heroId: hero.heroId, tier });
    } else {
      const card = cardGoal(hero, constants, input.cardKeys);
      if (card) goals.push(card);
    }
    const rim = rimGoal(hero, constants);
    if (rim) goals.push(rim);
  }
  const level = levelGoal(input.stats, input.winXp);
  if (level) goals.push(level);
  const badge = badgeGoal(input.badges);
  if (badge) goals.push(badge);
  return [...rows, ...rankGoals(goals)].slice(0, NEXT_UP_LIMIT);
};

// --- the played hero, after the game -----------------------------------------

/**
 * The played hero's standing once this game's points are in.
 *
 * The page holds a PRE-game cosmetics row; the earned poll answers the hero's
 * new lifetime total. Whatever the total grew by is spendable too (a game
 * cannot spend), so `available` moves by the same amount — measured against
 * the held row's own `earned`, which keeps it right even when that row is a
 * few games stale. With no landed total the held row stands as it is.
 *
 * A hero the api has never listed has nothing yet: once a total has landed
 * that is a real zero to build on; before then it is unknown, and no row.
 */
export const heroAfterGame = (
  held: HeroCosmetics | null,
  heroId: string,
  landedEarned: number | null,
): HeroCosmetics | null => {
  if (landedEarned === null) return held;
  const base = held ?? emptyHeroCosmetics(heroId, true);
  if (base.earned === null || base.available === null) return { ...base, earned: landedEarned };
  return {
    ...base,
    earned: landedEarned,
    available: base.available + Math.max(0, landedEarned - base.earned),
  };
};

// --- copy --------------------------------------------------------------------

/** "Bronze" / "Silver" / … for a 1-based tier. */
export const tierName = (tier: number): string => {
  const name = rimTierName(tier);
  return name ? COSMETIC_RIM_PAINTS[name].label : `Tier ${tier}`;
};

/** Where an unlock row's button goes: that hero, selected, on /collection. */
export const collectionHref = (heroId: string): string => `/collection?hero=${encodeURIComponent(heroId)}`;

const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

export interface NextUpCopy {
  title: string;
  caption: string;
}

export const nextUpCopy = (row: NextUpRow, heroName: string): NextUpCopy => {
  switch (row.kind) {
    case "sign-in":
      return {
        title: "Sign in to start earning",
        caption: "Games on an account count toward a level, hero cosmetics and badges.",
      };
    case "unlock":
      return {
        title: `Upgrade available: ${tierName(row.tier)} on ${heroName}`,
        caption: "You have the points for it now.",
      };
    case "card":
      return {
        title: `${plural(row.toGo, "point", "points")} to a ${tierName(row.tier)} card`,
        caption: `${heroName} cosmetics`,
      };
    case "rim":
      return {
        title: `${plural(row.toGo, "point", "points")} to the ${tierName(row.tier)} token rim`,
        caption: `${heroName} cosmetics`,
      };
    case "level":
      return row.oneMoreWin
        ? { title: `One more win to level ${row.level}`, caption: `${row.toGo.toLocaleString()} XP to go` }
        : { title: `${row.toGo.toLocaleString()} XP to level ${row.level}`, caption: "Every counted game adds XP" };
    case "badge":
      return {
        title: `${row.name}: ${row.current.toLocaleString()} / ${row.target.toLocaleString()}`,
        caption: `${row.toGo.toLocaleString()} to go for the badge`,
      };
  }
};
