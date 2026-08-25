/**
 * The "🎲 Random" fighter tile in the pro lobby roster (issue #697).
 *
 * Same shape as the Random STAGE tile (#685): clicking it chooses NOTHING. The
 * sentinel sits in `selectedHeroId` until the create/join click, and only then
 * is a concrete hero rolled and sent — the wire never carries the sentinel,
 * because `CREATE_ROOM`/`JOIN_ROOM` demand a real `heroId`.
 *
 * The pool is whatever the roster is CURRENTLY SHOWING, not the whole server
 * listing. That is deliberate on two counts:
 *
 *  - the server already gates the listing (debug/reflavored decks are absent
 *    from `HEROES` unless this server serves them), so drawing from the listing
 *    respects that gating for free — there is no client-side allow-list to keep
 *    in sync;
 *  - the reach filter and the search box narrow what is on screen, so "random
 *    melee fighter" is just the filter plus the tile. Rolling something the
 *    player has filtered away would read as a bug.
 */
import type { HeroListing } from "./protocol";

/**
 * Sentinel `selectedHeroId` for the Random tile.
 *
 * Distinct from every hero id the server serves (they are deck slugs like
 * `king-kong`); `rollRandomHero` would happily return a hero genuinely named
 * `random` anyway, so a collision would degrade to "Random rolls itself", not
 * to a broken frame.
 */
export const RANDOM_HERO_ID = "random" as const;

/**
 * Roll one fighter uniformly out of `pool`, or null when the pool is empty
 * (every fighter filtered away — the tile is disabled in that state, so this is
 * the belt to the UI's braces).
 *
 * `rng` is injectable for tests, exactly like `rollRandomMap`.
 */
export function rollRandomHero(
  pool: HeroListing[],
  rng: () => number = Math.random,
): HeroListing | null {
  if (pool.length === 0) return null;
  const i = Math.min(pool.length - 1, Math.max(0, Math.floor(rng() * pool.length)));
  return pool[i];
}

/**
 * The hero id to actually commit for a lobby selection: a hand-picked hero
 * passes straight through, the Random sentinel resolves against `pool`, and
 * null (nothing picked, or Random with an empty pool) means "don't send".
 *
 * Both commit paths — create and join — funnel through this, so the sentinel
 * can never reach the socket.
 */
export function resolveHeroPick(
  selectedHeroId: string | null,
  pool: HeroListing[],
  rng: () => number = Math.random,
): string | null {
  if (!selectedHeroId) return null;
  if (selectedHeroId !== RANDOM_HERO_ID) return selectedHeroId;
  return rollRandomHero(pool, rng)?.heroId ?? null;
}
