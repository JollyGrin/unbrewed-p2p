/**
 * A newer copy of a deck landing on a table that is already playing the old
 * one (#996: a Labs deep link refreshes a deck that was already in the bag).
 *
 * Nothing here reshuffles, deals, moves or adds anything. Each card keeps its
 * place (deck order, hand, discard, a card on the board) and only takes the
 * new version's face and text; a hero-card image token keeps its id and
 * position and only swaps its image. A card the new version dropped keeps its
 * old face, and a card it added arrives on the next New game.
 *
 * Cards are matched by title, and only a title that is unique in the new
 * version — two different cards sharing one title can't be told apart.
 */
import {
  DeckImportCardType,
  DeckImportType,
} from "@/components/DeckPool/deck-import.type";
import { PoolType, newPool } from "@/components/DeckPool/PoolFns";
import { BoardToken, SavedToken } from "@/components/Positions/position.type";

export type DeckRefresh = { from: DeckImportType; to: DeckImportType };

const uniqueByTitle = <T extends { title: string }>(cards: T[]) => {
  const byTitle = new Map<string, T | null>();
  for (const card of cards) {
    byTitle.set(card.title, byTitle.has(card.title) ? null : card);
  }
  return byTitle;
};

const cardImageUrl = (card: DeckImportCardType) =>
  card.cardImage?.url || card.imageUrl || undefined;

/** Old card → its new version, as the pool holds it (text normalised, back backfilled). */
const cardRefacer = (to: DeckImportType) => {
  const fresh = uniqueByTitle(newPool(to).cards);
  return (card: DeckImportCardType): DeckImportCardType => {
    const next = fresh.get(card.title);
    return next ? { ...next } : card;
  };
};

/** Old hero/rule card (or Labs component) image url → its new image url. */
const imageRefacer = (from: DeckImportType, to: DeckImportType) => {
  const fresh = uniqueByTitle(to.deck_data?.cards ?? []);
  const swaps = new Map<string, string>();
  for (const card of from.deck_data?.cards ?? []) {
    const oldUrl = cardImageUrl(card);
    const next = fresh.get(card.title);
    const newUrl = next && cardImageUrl(next);
    if (oldUrl && newUrl && oldUrl !== newUrl) swaps.set(oldUrl, newUrl);
  }
  // Labs component tokens (#1001): matched by figure id, since the hosted
  // image url changes whenever the author republishes.
  const freshComponents = new Map(
    (to.labsComponents ?? []).map((c) => [c.key, c.url] as const),
  );
  for (const component of from.labsComponents ?? []) {
    const newUrl = freshComponents.get(component.key);
    if (newUrl && newUrl !== component.url) swaps.set(component.url, newUrl);
  }
  return <T extends { imageUrl?: string }>(token: T): T => {
    const newUrl = token.imageUrl && swaps.get(token.imageUrl);
    return newUrl ? { ...token, imageUrl: newUrl } : token;
  };
};

/** True when this pool was built from `deck` (and not from a deck switched to since). */
export const poolIsFrom = (pool: PoolType, deck: DeckImportType) =>
  pool.deckid === deck.family_id;

export const refreshPool = (
  pool: PoolType,
  { to }: DeckRefresh,
): PoolType => {
  const reface = cardRefacer(to);
  const each = (cards?: DeckImportCardType[] | null) => cards?.map(reface);
  const one = (card: DeckImportCardType | null) => card && reface(card);
  return {
    ...pool,
    cards: newPool(to).cards,
    deck: each(pool.deck) ?? null,
    hand: each(pool.hand) ?? [],
    discard: each(pool.discard) ?? [],
    ...(pool.removed ? { removed: each(pool.removed) } : {}),
    commit: {
      ...pool.commit,
      main: one(pool.commit.main),
      boost: one(pool.commit.boost),
      ...(pool.commit.extraBoosts
        ? { extraBoosts: each(pool.commit.extraBoosts) }
        : {}),
    },
  };
};

/** Board tokens: card tokens take the new card, hero-card tokens the new image. */
export const refreshTokens = (
  tokens: BoardToken[],
  { from, to }: DeckRefresh,
): BoardToken[] => {
  const reface = cardRefacer(to);
  const reimage = imageRefacer(from, to);
  return tokens.map((token) =>
    token.card ? { ...token, card: reface(token.card) } : reimage(token),
  );
};

/** A deck's saved loadout: the same tokens, hero-card images swapped to the new renders. */
export const refreshSavedTokens = (
  tokens: SavedToken[],
  { from, to }: DeckRefresh,
): SavedToken[] => tokens.map(imageRefacer(from, to));
