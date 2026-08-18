/**
 * The hero list /collection browses (ticket #614).
 *
 * Built from the metadata the client already has — `HERO_DECK_IDS` (the one
 * hero↔deck mapping for Pro) joined to `POPULAR_DECKS` for display names —
 * rather than from the live roster socket. /collection is a static page about
 * what you OWN, not about what the engine is serving this minute; opening a
 * websocket to name a hero would make the page fail when the game server is
 * down, which is exactly backwards.
 *
 * Two rules the ordering encodes:
 *
 *  - **Heroes you have points on come first**, in the API's own order (games
 *    descending). That is the list a player came to look at.
 *  - **A hero the API knows and we don't is still listed.** A retired deck, or
 *    one added upstream before the client caught up, must never make somebody's
 *    purchases disappear — the same reason the API itself unions its ledger
 *    into the telemetry list.
 */
import { POPULAR_DECKS, PopularDeckMeta } from "@/lib/constants/top-decks";
import { DECK_HERO_IDS, HERO_DECK_IDS } from "@/lib/pro/useProCardArt";

export interface CollectionHero {
  heroId: string;
  /** Evergreen deck id — the snapshot to load art from, or null if unknown. */
  deckId: string | null;
  name: string;
  /** Playable but unsettled; the tile carries the same caution /pro shows. */
  lab: boolean;
}

/** Presentation metadata by server hero id. Built once — POPULAR_DECKS is static. */
const DECK_BY_HERO_ID: Record<string, PopularDeckMeta> = Object.fromEntries(
  POPULAR_DECKS.flatMap((deck) => {
    const heroId = DECK_HERO_IDS[deck.id];
    return heroId ? [[heroId, deck] as const] : [];
  }),
);

/** "darth-maul" → "Darth Maul", for a hero with no curated tile. */
const prettify = (heroId: string): string =>
  heroId
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const entryFor = (heroId: string): CollectionHero => {
  const deck = DECK_BY_HERO_ID[heroId];
  // A reflavored baseline shares its display name with the spice remix that
  // replaced it, so it gets /pro's ` ★` disambiguator — a player who has points
  // on both must be able to tell the two rows apart.
  const star = deck?.tier === "reflavored" ? " ★" : "";
  return {
    heroId,
    deckId: HERO_DECK_IDS[heroId] ?? deck?.id ?? null,
    name: `${deck?.name ?? prettify(heroId)}${star}`,
    lab: deck?.tier === "lab",
  };
};

/**
 * Every hero worth showing, in reading order.
 *
 * Reflavored baselines are hidden from the DEFAULT list (their spice remix is
 * already there under the same name), but appear the moment the API reports
 * points on one — hiding a hero somebody has spent on would be a bug, not tidy.
 */
export const collectionRoster = (apiHeroIds: string[] = []): CollectionHero[] => {
  const seen = new Set<string>();
  const roster: CollectionHero[] = [];
  for (const heroId of apiHeroIds) {
    if (!heroId || seen.has(heroId)) continue;
    seen.add(heroId);
    roster.push(entryFor(heroId));
  }
  const rest = Object.keys(HERO_DECK_IDS)
    .filter((heroId) => !seen.has(heroId) && DECK_BY_HERO_ID[heroId]?.tier !== "reflavored")
    .map(entryFor)
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...roster, ...rest];
};
