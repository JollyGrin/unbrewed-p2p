/**
 * The hero list /collection browses (tickets #614, #625).
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
 *    descending). The picker re-sorts them by earned points (#625, see
 *    `picker.ts`); this file's job is only to say WHO is on the list.
 *  - **A hero the API knows and we don't is still listed.** A retired deck, or
 *    one added upstream before the client caught up, must never make somebody's
 *    purchases disappear — the same reason the API itself unions its ledger
 *    into the telemetry list.
 *
 * Reflavored baselines (`thetis`, `king-taranis`, …) are the one exception to
 * that second rule, and #625 made it absolute: they are dropped from the list
 * even when the API reports points on one. A player cannot take a baseline to
 * the table — the spice remix replaced it under the same display name — so a
 * row for one is a row nobody can act on, and its points are folded into the
 * successor upstream (unbrewed-api). "Unknown hero id" still renders; only
 * "known to be a retired baseline" is filtered.
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

/** A baseline whose spice remix replaced it — never listed. See the header. */
const isReflavored = (heroId: string): boolean =>
  DECK_BY_HERO_ID[heroId]?.tier === "reflavored";

const entryFor = (heroId: string): CollectionHero => {
  const deck = DECK_BY_HERO_ID[heroId];
  return {
    heroId,
    deckId: HERO_DECK_IDS[heroId] ?? deck?.id ?? null,
    // No ` ★` disambiguator: the baseline it told apart is gone from the list,
    // so the only "Thetis" row left is the one you can actually play.
    name: deck?.name ?? prettify(heroId),
    lab: deck?.tier === "lab",
  };
};

/**
 * Every hero worth showing, API rows first and the rest of the Pro roster
 * behind them, alphabetically.
 */
export const collectionRoster = (apiHeroIds: string[] = []): CollectionHero[] => {
  const seen = new Set<string>();
  const roster: CollectionHero[] = [];
  for (const heroId of apiHeroIds) {
    if (!heroId || seen.has(heroId) || isReflavored(heroId)) continue;
    seen.add(heroId);
    roster.push(entryFor(heroId));
  }
  const rest = Object.keys(HERO_DECK_IDS)
    .filter((heroId) => !seen.has(heroId) && !isReflavored(heroId))
    .map(entryFor)
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...roster, ...rest];
};
