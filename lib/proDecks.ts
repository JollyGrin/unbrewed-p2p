/**
 * The Pro roster as pickable decks, with no bag involved (#1421).
 *
 * The roster is `EVERGREEN_DECK_IDS` (derived from HERO_DECK_IDS), and
 * `fetchDeckById` serves each id from the repo-hosted snapshot, so a visitor
 * with an empty bag can still pick and play one. Nothing here writes to the
 * bag: a picked Pro deck is just its id in the star pointer, resolved back to
 * a deck through this cache (see `useBagDecks` / `readStarredDeckFromBag`).
 *
 * Authors who asked not to be importable (Jowee, #790) are filtered here too,
 * so a snapshot that ever lands under such an author can't surface. So are the
 * Pro-only decks (`PRO_ONLY_DECK_IDS`, #1718): every picker fed from here deals
 * by hand, which those decks can't be.
 */
import { useEffect, useState } from "react";
import type { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { isImportBlocked } from "@/lib/decks/blockedAuthors";
import { EVERGREEN_DECK_IDS, fetchDeckById, PRO_ONLY_DECK_IDS } from "@/lib/evergreenDecks";

/** Evergreen decks a hand-dealt surface can use (Pro-only decks left out). */
const isHandDealable = (id: string) => EVERGREEN_DECK_IDS.has(id) && !PRO_ONLY_DECK_IDS.has(id);

export const PRO_DECK_IDS: string[] = [...EVERGREEN_DECK_IDS].filter(isHandDealable);

const cache = new Map<string, DeckImportType>();
const failed = new Set<string>();
const inflight = new Map<string, Promise<DeckImportType | undefined>>();

/** A Pro deck already fetched this session; undefined until `loadProDeck`. */
export const cachedProDeck = (id: string): DeckImportType | undefined =>
  cache.get(id);

/** One Pro deck by id; undefined for a non-roster id or a failed fetch. */
export const loadProDeck = (id: string): Promise<DeckImportType | undefined> => {
  if (!isHandDealable(id)) return Promise.resolve(undefined);
  const kept = cache.get(id);
  if (kept) return Promise.resolve(kept);
  let pending = inflight.get(id);
  if (!pending) {
    pending = fetchDeckById(id)
      .then((deck) => {
        if (isImportBlocked(deck)) {
          failed.add(id);
          return undefined;
        }
        cache.set(id, deck);
        return deck;
      })
      .catch(() => {
        failed.add(id);
        return undefined;
      })
      .finally(() => inflight.delete(id));
    inflight.set(id, pending);
  }
  return pending;
};

/** The whole roster, in roster order; decks that fail to load are left out. */
export const loadProDecks = async (): Promise<DeckImportType[]> =>
  (await Promise.all(PRO_DECK_IDS.map(loadProDeck))).filter(
    (deck): deck is DeckImportType => !!deck,
  );

/** The roster for a picker; `undefined` while it loads. */
export const useProDecks = (): DeckImportType[] | undefined => {
  const [decks, setDecks] = useState<DeckImportType[]>();
  useEffect(() => {
    let live = true;
    void loadProDecks().then((loaded) => live && setDecks(loaded));
    return () => {
      live = false;
    };
  }, []);
  return decks;
};

/** One Pro deck by id ("" for none); `loading` while its fetch is in flight. */
export const useProDeck = (
  id: string,
): { deck: DeckImportType | undefined; loading: boolean } => {
  const [, tick] = useState(0);
  const wanted = isHandDealable(id) ? id : "";
  const deck = wanted ? cachedProDeck(wanted) : undefined;
  useEffect(() => {
    if (!wanted || cachedProDeck(wanted)) return;
    let live = true;
    void loadProDeck(wanted).then(() => live && tick((n) => n + 1));
    return () => {
      live = false;
    };
  }, [wanted]);
  return { deck, loading: !!wanted && !deck && !failed.has(wanted) };
};
