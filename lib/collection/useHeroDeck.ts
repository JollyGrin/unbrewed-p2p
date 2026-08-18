/**
 * The card sets one hero's deck offers /collection (ticket #614).
 *
 * Art comes from the SAME frozen snapshot every other Pro surface reads
 * (`public/evergreen-decks/<deckId>.json`, see `useProCardArt`) — no live deck
 * API, no second copy of the art index. A cosmetic is bought against a card
 * SET, keyed by `norm(title)`, which is the key the snapshot index, the rim
 * registry and the API's `cardKey` all already agree on; if they ever drifted,
 * a purchased rim would silently miss its card.
 */
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

import {
  DeckImportCardType,
  DeckImportType,
} from "@/components/DeckPool/deck-import.type";
import { norm } from "@/lib/pro/cardAppearance";

/**
 * Longest `cardKey` the accounts API stores (its `MAX_KEY_LENGTH`). A title
 * past it can't be bought, so the grid says so rather than firing a 400 that
 * would read as an outage.
 */
export const MAX_CARD_KEY_LENGTH = 64;

/** One upgradeable card set: a unique title within the deck. */
export interface CardSet {
  /** `norm(title)` — the key sent as `cardKey` and read back on every render. */
  key: string;
  title: string;
  /** Copies of this card in the deck; a set is upgraded as a whole. */
  quantity: number;
  /** The snapshot entry, for the real card renderer to draw. */
  card: DeckImportCardType;
}

export interface HeroDeckArt {
  sets: CardSet[];
  /** The hero's board-token portrait, or null for an initials-only token. */
  tokenUrl: string | null;
  heroName: string;
}

/**
 * Unique card sets in snapshot order. Character/rule cards are skipped — they
 * are never in the draw deck and are not something a player collects — and a
 * repeated title folds into one set, since a cosmetic belongs to a CARD and two
 * copies of Feint must never look like two different game objects.
 */
export const cardSetsOf = (deck: DeckImportType): CardSet[] => {
  const sets: CardSet[] = [];
  const byKey = new Map<string, CardSet>();
  for (const card of deck.deck_data?.cards ?? []) {
    if (card.isCharacterCard) continue;
    const key = norm(card.title ?? "");
    if (!key) continue;
    const seen = byKey.get(key);
    if (seen) {
      seen.quantity += card.quantity ?? 1;
      continue;
    }
    const set: CardSet = {
      key,
      title: card.title,
      quantity: card.quantity ?? 1,
      card,
    };
    byKey.set(key, set);
    sets.push(set);
  }
  return sets;
};

/**
 * One hero's deck art. Snapshot only, cached forever: these files are frozen by
 * the rules lock, so a refetch could never return anything different.
 */
export const useHeroDeck = (deckId: string | null) => {
  const { data, isLoading } = useQuery(
    ["collection-deck", deckId],
    async (): Promise<HeroDeckArt | null> => {
      const res = await axios
        .get<DeckImportType>(`/evergreen-decks/${deckId}.json`)
        .catch(() => null);
      // Art is a nicety, never a dependency (the useProCardArt rule): a missing
      // snapshot costs the grid its thumbnails, not the page.
      if (!res) return null;
      return {
        sets: cardSetsOf(res.data),
        tokenUrl: res.data.deck_data?.hero?.tokenImageUrl ?? null,
        heroName: res.data.deck_data?.hero?.name ?? "",
      };
    },
    { enabled: !!deckId, staleTime: Infinity, retry: 1 },
  );
  return { deck: data ?? null, isLoading: !!deckId && isLoading };
};
