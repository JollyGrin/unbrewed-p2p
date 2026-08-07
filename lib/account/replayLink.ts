/**
 * Joining a history row to a replay this browser happens to have saved (#573).
 *
 * There is no shared key to join on, and that is not an oversight:
 *
 *  - telemetry's game id is minted server-side as
 *    `live-<roomId>-<roomCreatedAt>-<stateHash12>` and is never sent to a
 *    client — the engine posts it to telemetry and drops it;
 *  - a local replay's id is a content hash of the bundle (`replayId()` in
 *    lib/pro/replayStore.ts), computed in the browser.
 *
 * So we join on the natural key both sides *do* carry. The engine stamps the
 * replay bundle's `meta.endedAt` and the telemetry submission's `endedAt` from
 * the same clock in the same GAME_OVER handler, so they agree to within a tick;
 * turns and the hero line-up then make a collision vanishingly unlikely. The
 * tolerance is generous anyway (`MATCH_WINDOW_MS`) because the two stamps take
 * different paths and only one of them survives a `COALESCE(ended_at,
 * received_at)` in telemetry.
 *
 * A miss is cheap and expected — replays live in one browser for seven days,
 * history lives forever — so this only ever *adds* a link, and an id equality
 * check runs first in case a future producer starts stamping the real game id.
 */
import type { AccountGame } from "./gameHistory";
import type { ReplayIndexEntry } from "@/lib/pro/replayStore";

/** How far apart the two `endedAt` stamps may sit and still be one game. */
export const MATCH_WINDOW_MS = 5 * 60_000;

const heroKey = (heroes: ReadonlyArray<string | null>): string =>
  heroes
    .filter((hero): hero is string => typeof hero === "string" && hero !== "")
    .map((hero) => hero.toLowerCase())
    .sort()
    .join("|");

/**
 * The id of a locally saved replay of `game`, or null if this browser has none.
 * Ties (two saved replays inside the window) resolve to the closest stamp.
 */
export const localReplayIdForGame = (
  game: AccountGame,
  entries: ReadonlyArray<ReplayIndexEntry>,
): string | null => {
  const exact = entries.find((entry) => entry.id === game.id);
  if (exact) return exact.id;

  const endedAt = Date.parse(game.endedAt);
  if (!Number.isFinite(endedAt)) return null;
  const wanted = heroKey([
    game.you.heroId,
    ...game.opponents.map((opponent) => opponent.heroId),
  ]);
  // No hero ids at all would make every same-length game a "match".
  if (!wanted) return null;

  let best: { id: string; distance: number } | null = null;
  for (const entry of entries) {
    const distance = Math.abs(entry.endedAt - endedAt);
    if (distance > MATCH_WINDOW_MS) continue;
    if (game.turns !== null && entry.turns !== game.turns) continue;
    if (heroKey(entry.heroes) !== wanted) continue;
    if (!best || distance < best.distance) best = { id: entry.id, distance };
  }
  return best?.id ?? null;
};

/** Where a matched replay opens (the browser deep-link ReplaysBrowser reads). */
export const localReplayHref = (replayId: string): string =>
  `/pro/replays?open=${encodeURIComponent(replayId)}`;
