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
 * Below those sit three suggestions for the next game itself (p2p #1659): the
 * bot ladder (beat a tier, get a one-tap rematch one tier up), progress toward
 * the hidden bot, and a hero never piloted. A goal that is at least half way
 * (`NEAR_MISS`) outranks them; one further off does not, so a new account's
 * three 0% bars do not bury the one row that says what to play next. The one
 * exception (#1666): when practice pay is used up, the row that says so sits
 * right under an available upgrade, above every goal, win or lose.
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
import { knownBotTierMeta } from "@/lib/pro/botTiers";
import { COSMETIC_RIM_PAINTS } from "@/lib/pro/cosmetics";
import type { BotDifficulty } from "@/lib/pro/protocol";
import type { FinishedGameSetup } from "@/lib/pro/rematch";
import { rematchQuery } from "@/lib/pro/rematch";
import { TIER_UNLOCK } from "@/lib/pro/tierUnlock";

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
  | ({ kind: "badge"; id: string; name: string; current: number; target: number } & Goal)
  | NextUpSuggestion;

/** What to play next (p2p #1659). Each one is a row only when it applies. */
export type NextUpSuggestion =
  /**
   * You beat `from`; `href` is the same setup with the bots at `to`.
   * `practiceSpent`: the paid easy/medium games are used up, so `to` is the
   * first tier that still pays XP.
   */
  | { kind: "ladder"; from: BotDifficulty; to: BotDifficulty; practiceSpent: boolean; href: string }
  /**
   * The same "practice XP is used up" message after a game that was NOT won
   * (#1666): there is no rung to climb, so it carries no link. `to` is the
   * first tier that still pays.
   */
  | { kind: "practice-spent"; to: BotDifficulty }
  /** Wins vs Expert toward the hidden tier (`TIER_UNLOCK`). `progress` draws the bar. */
  | { kind: "hidden-bot"; wins: number; target: number; progress: number }
  /** A hero never piloted; `points` is what its first game pays, `href` a bot game as it. */
  | { kind: "new-hero"; heroId: string; heroName: string; points: number; href: string };

export type NextUpGoal = Exclude<NextUpRow, { kind: "sign-in" } | { kind: "unlock" } | NextUpSuggestion>;

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
 * An older api sends a badge's requirement and progress as one human string;
 * the trailing `(n/m)` is the only machine-readable part of it. This parse is
 * the FALLBACK since #1666: `badgeProgressOf` prefers the structured
 * `progress` field. A badge with neither (a one-off feat on an older api) has
 * no "how close", so it is never a row.
 */
export const badgeProgress = (unlockedWhy: string): { current: number; target: number } | null => {
  const match = /\(\s*([\d,]+)\s*\/\s*([\d,]+)\s*\)\s*$/.exec(unlockedWhy);
  if (!match) return null;
  const current = Number(match[1].replace(/,/g, ""));
  const target = Number(match[2].replace(/,/g, ""));
  if (!Number.isFinite(current) || !Number.isFinite(target) || target <= 0) return null;
  return { current, target };
};

/** A badge's progress: the api's structured field when present, else the text parse. */
export const badgeProgressOf = (
  badge: Pick<Badge, "unlockedWhy" | "progress">,
): { current: number; target: number } | null => {
  const sent = badge.progress;
  if (sent && Number.isFinite(sent.current) && Number.isFinite(sent.target) && sent.target > 0 && sent.current >= 0) {
    return { current: sent.current, target: sent.target };
  }
  return badgeProgress(badge.unlockedWhy);
};

/** The locked badge closest to unlocking; the catalog's order breaks a tie. */
const badgeGoal = (badges: readonly Badge[]): NextUpGoal | null => {
  let best: NextUpGoal | null = null;
  for (const badge of badges) {
    if (badge.unlocked) continue;
    const progress = badgeProgressOf(badge);
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

// --- what to play next (p2p #1659) -------------------------------------------

/** The climb. The hidden tier is not a rung: it is earned, not suggested. */
const LADDER: readonly BotDifficulty[] = ["easy", "medium", "hard", "expert"];
/** The lowest tier whose games pay XP without a cap. */
const PAID_TIER: BotDifficulty = "hard";
/** What a new-hero game is played against when the last game names no usable tier. */
const DEFAULT_TRY_TIER: BotDifficulty = "medium";

const gameHref = (setup: FinishedGameSetup): string =>
  `/pro/game?${new URLSearchParams(rematchQuery(setup)).toString()}`;

/**
 * The one difficulty every other seat was a bot at, or null: a human at the
 * table, mixed tiers, or no other seat at all is not a rung of the ladder.
 */
export const botTierPlayed = (setup: FinishedGameSetup | null): BotDifficulty | null => {
  const first = setup?.otherSeats[0]?.bot ?? null;
  if (!setup || !first) return null;
  return setup.otherSeats.every((seat) => seat.bot === first) ? first : null;
};

/**
 * The tier a win vs `beaten` leads to, or null when there is none to offer.
 * One rung up, except once practice pay is spent: then easy and medium both
 * point at the first tier that still pays. `offered` is what the server will
 * accept for this room's heroes (`availableBotTiers`); a rung it does not
 * serve is never suggested.
 */
export const ladderStep = (
  beaten: BotDifficulty | null,
  offered: readonly string[],
  practiceSpent: boolean,
): BotDifficulty | null => {
  const rung = beaten ? LADDER.indexOf(beaten) : -1;
  if (rung < 0 || rung >= LADDER.length - 1) return null;
  const paid = LADDER.indexOf(PAID_TIER);
  const to = practiceSpent && rung < paid ? PAID_TIER : LADDER[rung + 1];
  return offered.includes(to) ? to : null;
};

export interface LadderInput {
  /** The finished game's setup; null until the replay bundle lands (then: no row). */
  setup: FinishedGameSetup | null;
  /** You won it outright. Without a win there is no rung up, only the practice-spent note. */
  won: boolean;
  /** Tiers the server accepts for this room's heroes. */
  offered: readonly string[];
  /** `bonuses.practice` says the paid easy/medium games are all used. */
  practiceSpent: boolean;
}

const ladderRow = (input: LadderInput | null | undefined): NextUpSuggestion | null => {
  if (!input || !input.setup) return null;
  const from = botTierPlayed(input.setup);
  const spent = input.practiceSpent && (from === "easy" || from === "medium");
  if (!input.won) {
    // No win, no rematch a tier up. But a player whose practice pay is gone
    // still needs to hear where XP continues, if that tier is on offer.
    return spent && input.offered.includes(PAID_TIER) ? { kind: "practice-spent", to: PAID_TIER } : null;
  }
  const to = ladderStep(from, input.offered, spent);
  if (!from || !to) return null;
  const setup = { ...input.setup, otherSeats: input.setup.otherSeats.map((seat) => ({ ...seat, bot: to })) };
  return { kind: "ladder", from, to, practiceSpent: spent, href: gameHref(setup) };
};

/** A row from the first Expert win until the unlock; none before, none after. */
const hiddenBotRow = (expertWins: number | null | undefined): NextUpSuggestion | null => {
  const target = TIER_UNLOCK.wins;
  if (typeof expertWins !== "number" || expertWins <= 0 || expertWins >= target) return null;
  return { kind: "hidden-bot", wins: expertWins, target, progress: expertWins / target };
};

export interface NewHeroInput {
  /** The heroes a player can pick, in the order the server lists them. */
  roster: readonly { heroId: string; name: string }[];
  /** Every hero id known to have a finished game, the one just played included. */
  piloted: readonly string[];
  /** `constants.heroFirstGamePoints`; null/absent (an older api) = no row. */
  points: number | null | undefined;
  /** The tier the last game's bots played at, to keep the next one familiar. */
  tier?: BotDifficulty | null;
  /** Games per hero across all players, when the page has it: the least-played wins. */
  heroPlays?: Readonly<Record<string, number>> | null;
}

/**
 * The hero to suggest: one never piloted, the least played overall when that
 * is known, otherwise (and on a tie) the roster's first.
 */
export const pickNewHero = (
  input: Pick<NewHeroInput, "roster" | "piloted" | "heroPlays">,
): { heroId: string; name: string } | null => {
  const piloted = new Set(input.piloted);
  const fresh = input.roster.filter((hero) => !piloted.has(hero.heroId));
  if (fresh.length === 0) return null;
  const plays = input.heroPlays;
  if (!plays) return fresh[0];
  return fresh.reduce((best, hero) => ((plays[hero.heroId] ?? 0) < (plays[best.heroId] ?? 0) ? hero : best));
};

/** A fresh duel as `heroId` against one bot (the server picks the bot's hero). */
export const newHeroHref = (heroId: string, tier: BotDifficulty): string =>
  gameHref({
    formatId: "duel",
    itemsWereOff: false,
    mapId: null,
    turnTimerSeconds: 0,
    mulliganWasOn: true,
    yourHeroId: heroId,
    otherSeats: [{ player: "p2", heroId: "", bot: tier }],
  });

const newHeroRow = (input: NewHeroInput | null | undefined): NextUpSuggestion | null => {
  if (!input || typeof input.points !== "number" || input.points <= 0) return null;
  const hero = pickNewHero(input);
  if (!hero) return null;
  // Easy, medium and hard are served for every hero; anything above is not a
  // tier to meet a new deck at.
  const tier = input.tier && LADDER.indexOf(input.tier) >= 0 && input.tier !== "expert" ? input.tier : DEFAULT_TRY_TIER;
  return { kind: "new-hero", heroId: hero.heroId, heroName: hero.name, points: input.points, href: newHeroHref(hero.heroId, tier) };
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
  /** The bot ladder's facts; absent = no ladder row. */
  ladder?: LadderInput | null;
  /** Recorded wins vs Expert; null/absent (no record, or already unlocked) = no row. */
  expertWins?: number | null;
  /** The new-hero suggestion's facts; absent = no row. */
  newHero?: NewHeroInput | null;
}

/** A goal at least this far through its step outranks the suggestions. */
export const NEAR_MISS = 0.5;

/** Fixed order for equally-close goals, so the strip never reshuffles between renders. */
const TIE_ORDER: Record<NextUpGoal["kind"], number> = { card: 0, rim: 1, level: 2, badge: 3 };

/** The "practice XP is used up" row, with or without its ladder link. */
const saysPracticeSpent = (row: NextUpSuggestion): boolean =>
  row.kind === "practice-spent" || (row.kind === "ladder" && row.practiceSpent);

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
  // In the ticket's order: the follow-up to this game, then the long climb,
  // then something different.
  const suggestions = [ladderRow(input.ladder), hiddenBotRow(input.expertWins), newHeroRow(input.newHero)].filter(
    (row): row is NextUpSuggestion => row !== null,
  );
  const ranked = rankGoals(goals);
  const near = ranked.filter((goal) => goal.progress >= NEAR_MISS);
  const far = ranked.filter((goal) => goal.progress < NEAR_MISS);
  // Practice pay running out is news the player needs now (#1666): it goes
  // above the near-miss goals, and only an upgrade already in hand tops it.
  const urgent = suggestions.filter(saysPracticeSpent);
  const rest = suggestions.filter((row) => !saysPracticeSpent(row));
  return [...rows, ...urgent, ...near, ...rest, ...far].slice(0, NEXT_UP_LIMIT);
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

/** "Hard bot" for a tier this client shows; the bare id for one it does not. */
const botLabel = (tier: BotDifficulty): string => knownBotTierMeta(tier)?.label ?? `${tier} bot`;

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
    case "ladder":
      return {
        title: `Ready for the ${botLabel(row.to)}?`,
        caption: row.practiceSpent
          ? `Practice XP is used up. ${botLabel(row.to)}s are where XP continues.`
          : `You beat the ${botLabel(row.from)}. Same setup, one step up.`,
      };
    case "practice-spent":
      return {
        title: "Practice XP is used up",
        caption: `${botLabel(row.to)}s are where XP continues.`,
      };
    case "hidden-bot":
      return {
        title: `${row.wins}/${row.target} expert wins`,
        caption: `Win ${row.target} vs the Expert bot to unlock a hidden bot`,
      };
    case "new-hero":
      return {
        title: `Try ${row.heroName}`,
        caption: `First game as a new hero pays +${plural(row.points, "point", "points")}`,
      };
  }
};
