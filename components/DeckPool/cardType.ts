import { UnmatchedCardType } from "./deck-import.type";

/**
 * Card `type` spellings seen in the wild, keyed lowercase. unmatched.cards
 * normally emits `defence`, but some decks (and Labs / club sources) use the US
 * `defense` (issue #1604).
 */
const CARD_TYPES: Record<string, UnmatchedCardType> = {
  attack: "attack",
  defense: "defence",
  defence: "defence",
  versatile: "versatile",
  scheme: "scheme",
};

/**
 * Any incoming card type as one of the four the client draws: case-insensitive,
 * trimmed, `defense` -> `defence`, anything unknown or missing -> `versatile`.
 */
export const normalizeCardType = (type: unknown): UnmatchedCardType =>
  (typeof type === "string" ? CARD_TYPES[type.trim().toLowerCase()] : undefined) ??
  "versatile";

/** The card with its type normalized; the same object when it already was. */
export const withNormalizedType = <T extends { type: UnmatchedCardType }>(card: T): T => {
  const type = normalizeCardType(card.type);
  return type === card.type ? card : { ...card, type };
};
