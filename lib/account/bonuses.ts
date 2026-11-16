/**
 * The starter-reward and daily blocks of `GET /me/stats` (p2p #1656, the
 * onboarding train's shared contract).
 *
 * Both blocks are OPTIONAL on the wire and stay optional here: an api that has
 * not shipped them sends neither, and every reader treats `null` as "today's
 * behaviour". The amounts inside them (100 XP, the practice cap, the daily
 * ladder) are the api's and are only ever read back, never recomputed: the
 * economy constants live in unbrewed-api alone.
 */

/** `bonuses` on `/me/stats`. Each inner block is null when the api left it out. */
export interface StatsBonuses {
  /** The account's first finished game of any kind. */
  firstGame: { xp: number; earned: boolean } | null;
  /** The first `cap` easy/medium bot games pay XP; `used` counts them. */
  practice: { cap: number; used: number; xpPerGame: number; xpPerWin: number; xp: number } | null;
  /** Lifetime daily-bonus XP, once the api's daily ticket lands. */
  daily: { xp: number } | null;
  /**
   * Lifetime starter-quest XP (#1666). Optional even on the parsed side: an
   * api before the quests total sends none, and readers then fall back to
   * the `/me/quests` rows alone.
   */
  quests?: { xp: number } | null;
}

/** `daily` on `/me/stats`: the UTC-day streak and what it pays. */
export interface DailyStats {
  /** Consecutive UTC days with a finished game. */
  streak: number;
  bestStreak: number;
  playedToday: boolean;
  wonToday: boolean;
  /** What today's first game pays (or paid). */
  playXpToday: number;
  /** What tomorrow's first game would pay if the streak holds. */
  playXpTomorrow: number;
  /** What the first win of a UTC day pays. */
  firstWinXp: number;
  /** ISO time of the next UTC midnight; null when the api sent none. */
  resetsAt: string | null;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const asCount = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;

/** `bonuses`, or null when the api sent no usable block. */
export const normalizeBonuses = (raw: unknown): StatsBonuses | null => {
  const root = asRecord(raw);
  if (!root) return null;
  const firstGame = asRecord(root.firstGame);
  const practice = asRecord(root.practice);
  const daily = asRecord(root.daily);
  const quests = asRecord(root.quests);
  if (!firstGame && !practice && !daily && !quests) return null;
  return {
    firstGame: firstGame ? { xp: asCount(firstGame.xp), earned: firstGame.earned === true } : null,
    practice: practice
      ? {
          cap: asCount(practice.cap),
          used: asCount(practice.used),
          xpPerGame: asCount(practice.xpPerGame),
          xpPerWin: asCount(practice.xpPerWin),
          xp: asCount(practice.xp),
        }
      : null,
    daily: daily ? { xp: asCount(daily.xp) } : null,
    // Only when sent: an older payload parses to exactly what it always did.
    ...(quests ? { quests: { xp: asCount(quests.xp) } } : {}),
  };
};

/** `daily`, or null when the api sent no block (a streak is the one field it cannot do without). */
export const normalizeDaily = (raw: unknown): DailyStats | null => {
  const root = asRecord(raw);
  if (!root || typeof root.streak !== "number") return null;
  const streak = asCount(root.streak);
  return {
    streak,
    bestStreak: Math.max(streak, asCount(root.bestStreak)),
    playedToday: root.playedToday === true,
    wonToday: root.wonToday === true,
    playXpToday: asCount(root.playXpToday),
    playXpTomorrow: asCount(root.playXpTomorrow),
    firstWinXp: asCount(root.firstWinXp),
    resetsAt: typeof root.resetsAt === "string" && root.resetsAt.length > 0 ? root.resetsAt : null,
  };
};
