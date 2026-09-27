/**
 * Shared, deterministic building blocks for the stats fixtures. Everything is
 * derived from a hash so a reload shows the same numbers (screenshots stay
 * comparable) while still looking like real, uneven data.
 */

/** The mockups' hash noise: stable pseudo-random in [0, 1) for a pair. */
export const noise = (a: number, b: number): number => {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** A small stable integer for a string (username / hero id). */
export const hashOf = (text: string): number => {
  let h = 7;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 100_003;
  return h;
};

const pad = (n: number): string => String(n).padStart(2, "0");

/** YYYY-MM-DD in UTC. */
export const isoDay = (date: Date): string =>
  `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

const DAY_MS = 86_400_000;

/** Midnight UTC `days` days before now. */
export const daysAgo = (days: number, now: number = Date.now()): Date => {
  const today = new Date(now);
  return new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - days * DAY_MS,
  );
};

/** Monday (UTC) of the ISO week `weeksBack` weeks before this one. */
export const isoWeekStart = (weeksBack: number, now: number = Date.now()): string => {
  const today = daysAgo(0, now);
  const sinceMonday = (today.getUTCDay() + 6) % 7;
  return isoDay(new Date(today.getTime() - (sinceMonday + weeksBack * 7) * DAY_MS));
};

/** First instant of the current UTC month, ISO. */
export const monthStart = (now: number = Date.now()): string => {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
};
