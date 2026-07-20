import type { DeckImportCardType } from "@/components/DeckPool/deck-import.type";
import { SavedToken, cardTokenHeight } from "./position.type";

/**
 * Hero/rule cards spawn narrower than a played card (DEFAULT_CARD_TOKEN_WIDTH
 * is 260): they sit on the table for the whole game as reference, so they need
 * to stay legible on zoom without dominating a 1200x1000 map.
 */
export const HERO_CARD_TOKEN_WIDTH = 130;

/**
 * Turn a card flagged `isCharacterCard` into a saved image token.
 *
 * Deliberately a plain image token, never a `card` token: a saved card would
 * detach from the pool it belongs to and duplicate itself into every game the
 * deck is used in (see SavedToken). The art is still croppable because the
 * token carries `sheet` — TTS/club exports pack ~70 faces into one image, so
 * seeding the bare url would spawn the whole sprite sheet.
 *
 * Returns null for a card with no art (generated/template decks): there is
 * nothing to show on the board, and the rules panel covers those instead.
 */
export const heroCardToken = (card: DeckImportCardType): SavedToken | null => {
  const image = card.cardImage;
  const url = image?.url || card.imageUrl;
  if (!url) return null;

  const isSheet = !!image?.cols && !!image?.rows;
  return {
    imageUrl: url,
    ...(isSheet
      ? {
          sheet: {
            cols: image!.cols!,
            rows: image!.rows!,
            index: image!.index ?? 0,
          },
        }
      : {}),
    size: HERO_CARD_TOKEN_WIDTH,
    h: cardTokenHeight(HERO_CARD_TOKEN_WIDTH),
  };
};

/**
 * Identity of a seeded hero-card token, for dedupe and removal.
 *
 * URL alone is not enough: every card in a TTS deck shares one sprite-sheet
 * url and is told apart only by its cell index.
 */
const tokenKey = (token: SavedToken): string =>
  `${token.imageUrl ?? ""}#${token.sheet?.index ?? ""}`;

/**
 * Fold a hero/rule flag transition into a deck's saved loadout.
 *
 * Seeding happens on *transitions* only (import, or toggling the flag on in
 * /bag) — never on load. That is what makes deleting the token in
 * EditSavedTokens stick: nothing re-derives the loadout from the flags, so a
 * removed token stays removed until the user re-flags the card.
 *
 * Idempotent in both directions, so re-importing or re-starring a deck never
 * duplicates an entry.
 */
export const applyHeroCardFlag = (
  saved: SavedToken[],
  card: DeckImportCardType,
  flaggedOn: boolean,
): SavedToken[] => {
  const token = heroCardToken(card);
  if (!token) return saved;
  const key = tokenKey(token);
  const without = saved.filter((t) => tokenKey(t) !== key);
  return flaggedOn ? [...without, token] : without;
};

/**
 * Seed a loadout for a freshly built deck: one token per flagged card, in deck
 * order. Used at import, where there is no prior loadout to preserve.
 */
export const seedHeroCardTokens = (
  cards: DeckImportCardType[],
): SavedToken[] => {
  const seeded: SavedToken[] = [];
  const seen = new Set<string>();
  for (const card of cards) {
    if (!card.isCharacterCard) continue;
    const token = heroCardToken(card);
    if (!token) continue;
    const key = tokenKey(token);
    if (seen.has(key)) continue;
    seen.add(key);
    seeded.push(token);
  }
  return seeded;
};
