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
 * so a snapshot that ever lands under such an author can't surface.
 */
import { useEffect, useState } from "react";
import type { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { isImportBlocked } from "@/lib/decks/blockedAuthors";
import { EVERGREEN_DECK_IDS, fetchDeckById } from "@/lib/evergreenDecks";

/**
 * Originals whose `-spice` remix (the edited version, same display name) is
 * the one to pick (#1437). Hidden from the picker only: they stay in
 * `EVERGREEN_DECK_IDS`, so Pro lobbies, `fetchDeckById`, `loadProDeck` and a
 * bag/star already pointing at one keep resolving.
 */
export const PICKER_HIDDEN_DECK_IDS: ReadonlySet<string> = new Set([
  "hollow-oak",
  "piper",
  "thetis",
  "taranis",
]);

export const PRO_DECK_IDS: string[] = [...EVERGREEN_DECK_IDS].filter(
  (id) => !PICKER_HIDDEN_DECK_IDS.has(id),
);

const cache = new Map<string, DeckImportType>();
const failed = new Set<string>();
const inflight = new Map<string, Promise<DeckImportType | undefined>>();

/** A Pro deck already fetched this session; undefined until `loadProDeck`. */
export const cachedProDeck = (id: string): DeckImportType | undefined =>
  cache.get(id);

/** One Pro deck by id; undefined for a non-roster id or a failed fetch. */
export const loadProDeck = (id: string): Promise<DeckImportType | undefined> => {
  if (!EVERGREEN_DECK_IDS.has(id)) return Promise.resolve(undefined);
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

/** The picker roster, in roster order; decks that fail to load are left out. */
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
  const wanted = EVERGREEN_DECK_IDS.has(id) ? id : "";
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
