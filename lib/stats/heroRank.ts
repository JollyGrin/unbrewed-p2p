/**
 * Hero rank (contract §0): client-side only, never stored. Computed from a
 * player's `byHero[].games` on that hero. One helper owns the thresholds and
 * ring colours so the roster grid, the legend and the hero page's track can
 * never disagree.
 */
export type HeroRankName = "Tried" | "Bronze" | "Silver" | "Gold";

export interface HeroRankTier {
  name: HeroRankName;
  /** Games on the hero needed to reach this rank. */
  minGames: number;
  /** Ring colour around the hero token. */
  ring: string;
}

/** Lowest first. */
export const HERO_RANKS: readonly HeroRankTier[] = [
  { name: "Tried", minGames: 1, ring: "#8A4FA0" },
  { name: "Bronze", minGames: 5, ring: "#A8623A" },
  { name: "Silver", minGames: 25, ring: "#8D8794" },
  { name: "Gold", minGames: 100, ring: "#E0A82E" },
];

export interface HeroRankProgress {
  /** Current rank, or null for a hero never played (0 games). */
  rank: HeroRankTier | null;
  /** The next rank up, or null at Gold. */
  next: HeroRankTier | null;
  /** Games still needed for `next`; 0 at Gold. */
  toNext: number;
}

/** Rank for a game count; null below 1 game. */
export const heroRank = (games: number): HeroRankTier | null => {
  let found: HeroRankTier | null = null;
  for (const tier of HERO_RANKS) if (games >= tier.minGames) found = tier;
  return found;
};

export const heroRankProgress = (games: number): HeroRankProgress => {
  const rank = heroRank(games);
  const next = HERO_RANKS.find((tier) => games < tier.minGames) ?? null;
  return { rank, next, toNext: next ? next.minGames - Math.max(0, games) : 0 };
};
