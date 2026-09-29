/**
 * What one deck puts on a table.place table, in words a player reads before
 * creating it (issue #1008). Pure: the /table page renders it, the tests pin it.
 */
import type { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { EVERGREEN_DECK_IDS } from "@/lib/evergreenDecks";
import { deckToPlayerPack } from "./deckToPack";
import { balancedFaces, type FaceIndex } from "./faces";
import type { FaceResolver, Skipped } from "./types";

export type DeckPreview = {
  deckName: string;
  hero: { name: string; hp: number } | null;
  sidekick: { name: string; count: number; hp: number } | null;
  /** Action cards in the draw deck, one per copy. */
  cards: number;
  /** Face-up reference cards (rules, extra characters). */
  referenceCards: number;
  /** One HP dial per fighter, with its starting value. */
  dials: { name: string; value: number }[];
  tokens: string[];
  /** Why the deck can't go on the table; null when it can. */
  refused: string | null;
  /** The converter's list, in plain words. */
  skipped: string[];
};

export const isBalancedDeck = (deck: DeckImportType) =>
  EVERGREEN_DECK_IDS.has(deck.id);

/**
 * The one face lookup for any deck. A card's own finished image (a Labs
 * render, a TTS sheet) always wins inside the converter; the balanced-deck
 * index answers the rest, and answers null for a deck it doesn't list.
 */
export const facesFor = (
  deck: DeckImportType,
  index: FaceIndex | null,
): FaceResolver => balancedFaces(index, deck);

const NO_FACE = /: no finished face$/;
const NOT_PUBLISHED =
  "Card images for this deck aren't published yet. Balanced decks get theirs when this feature ships.";

/** "Branch Out: no finished face" → "“Branch Out” has no card image yet". */
export const plainSkipped = (s: Skipped): string => {
  const seat = /^Seat (\d): (.*)$/.exec(s);
  const rest = seat ? seat[2] : s;
  const who = seat ? (seat[1] === "0" ? "Your deck: " : "Their deck: ") : "";
  if (NO_FACE.test(rest)) {
    return `${who}“${rest.replace(NO_FACE, "")}” has no finished card image`;
  }
  const left = /^(token )?"?(.*?)"? left off \((.*)\)$/.exec(rest);
  if (left) {
    const [, , name, why] = left;
    return `${who}“${name}” stays off the table (${why})`;
  }
  return `${who}${rest}`;
};

const refusal = (
  deck: DeckImportType,
  skipped: Skipped[],
  index: FaceIndex | null,
): string | null => {
  const missing = skipped.filter((s) => NO_FACE.test(s)).length;
  if (!missing) return null;
  if (isBalancedDeck(deck) && !index?.decks?.[deck.id]) {
    return NOT_PUBLISHED;
  }
  const cards = missing === 1 ? "1 card has" : `${missing} cards have`;
  return `${cards} no finished card image. table.place shows cards as finished images, so every card, hero and sidekick needs one.`;
};

export const previewDeck = (
  deck: DeckImportType,
  index: FaceIndex | null,
): DeckPreview => {
  const data = deck.deck_data;
  const { skipped } = deckToPlayerPack(deck, { faces: facesFor(deck, index) });
  // The shape of the table doesn't depend on the faces: a stand-in face shows
  // what a refused deck WOULD put down, so its preview isn't empty.
  const { pack, pieces } = deckToPlayerPack(deck, { faces: () => "about:" });
  const slot = (name: string) =>
    pack?.decks?.find((d) => d.slot === name)?.cards.length ?? 0;
  const sidekickCount = pieces.filter(
    (p) => p.role === "fighter" && p.fighter === "sidekick",
  ).length;
  const refused = refusal(deck, skipped, index);

  return {
    deckName: data.name || deck.name,
    hero: data.hero?.name ? { name: data.hero.name, hp: data.hero.hp } : null,
    sidekick: sidekickCount
      ? {
          name: data.sidekick.name,
          count: sidekickCount,
          hp: data.sidekick.hp ?? 1,
        }
      : null,
    cards: slot("deck"),
    referenceCards: slot("rules") + slot("extras"),
    dials: pieces
      .filter((p) => p.role === "hp")
      .map((p) => ({
        name: p.piece.name.replace(/ HP$/, ""),
        value: p.value ?? 0,
      })),
    tokens: pieces.filter((p) => p.role === "token").map((p) => p.piece.name),
    refused,
    // "not published yet" is the whole story; a card-by-card list is noise
    skipped: refused === NOT_PUBLISHED ? [] : skipped.map(plainSkipped),
  };
};
