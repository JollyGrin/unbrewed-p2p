import type { DeckImportType } from "@/components/DeckPool/deck-import.type";

/**
 * Whether a deck has the shape every deck screen relies on (#1609): a string
 * `id` and `name`, `deck_data.cards` as an array and `deck_data.hero` as an
 * object. A deck that fails is refused at every bag add path, and a stored
 * one is never treated as the starred deck, so /connect and the in-game deck
 * picker can't crash on it.
 *
 * Shape only: card-level validation is somewhere else.
 */
export const isPlayableDeck = (deck: unknown): deck is DeckImportType => {
  if (!deck || typeof deck !== "object") return false;
  const d = deck as Record<string, unknown>;
  const data = d.deck_data as Record<string, unknown> | null | undefined;
  return (
    typeof d.id === "string" &&
    typeof d.name === "string" &&
    !!data &&
    typeof data === "object" &&
    Array.isArray(data.cards) &&
    !!data.hero &&
    typeof data.hero === "object"
  );
};

/** The toast for decks a bulk import skipped as malformed (#1609). */
export const skippedInvalidMessage = (count: number): string =>
  `Skipped ${count} ${count === 1 ? "deck" : "decks"} with no name, hero or cards`;
