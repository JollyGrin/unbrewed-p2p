/**
 * The opponent's deck on /table (issue #1008, challenge C2). v1 has no open
 * seats, so the host picks both decks before the lobby exists.
 */
import type { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { parseDeckLink } from "@/lib/deckLink";
import { parseLabsInput } from "@/lib/labs";

const UNMATCHED_CARDS = /unmatched\.cards\/decks\/([A-Za-z0-9]+)/i;

/**
 * A pasted deck link or id, as the `?deckId=` value `fetchLinkedDeck` takes:
 * an unmatched.cards deck URL comes down to its id, and everything else goes
 * through `parseDeckLink`, the parser the `?deckId=` pages use (a Labs share
 * link, `labs:char_…`, a bare deck id). Null when it can't name a deck.
 */
export const opponentDeckLink = (raw: string): string | null => {
  const input = raw.trim();
  if (!input) return null;
  const cards = UNMATCHED_CARDS.exec(input)?.[1];
  if (cards) return cards;
  // a Labs share link naming a character (`?deckId=` itself takes `labs:`)
  const labs = parseLabsInput(input);
  if (labs?.kind === "character") return `labs:${labs.characterId}`;
  const link = parseDeckLink(input);
  if (!link) return null;
  if (link.source === "labs") return `labs:${link.characterId}`;
  // a URL from anywhere else isn't a deck id
  return /^[A-Za-z0-9_-]+$/.test(input) ? input : null;
};

/**
 * A bag deck's line in the opponent dropdown: its name, plus the hero when
 * the name doesn't already say it.
 */
export const bagDeckLabel = (deck: DeckImportType): string => {
  const hero = deck.deck_data?.hero?.name;
  if (!hero || deck.name.toLowerCase().includes(hero.toLowerCase())) {
    return deck.name;
  }
  return `${deck.name} (${hero})`;
};
