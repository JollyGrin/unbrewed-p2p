/**
 * Authors who have asked that their decks never be imported into Unbrewed
 * (#790). This is the write-path guardrail: the bag layer (`useBagDecks`) and
 * the invite/share write (`persistAndStarDeck`) both refuse a deck whose
 * top-level `user` is listed here, whichever way it arrived — deck code, JSON
 * paste, file upload, backup restore, share preview. Checking only at fetch
 * time would miss every path that never touches unmatched.cards.
 *
 * Decks already in someone's bag are deliberately left alone.
 *
 * Entries are lowercase; matching is case-insensitive and whitespace-trimmed.
 */
import { DeckImportType } from "@/components/DeckPool/deck-import.type";

export const BLOCKED_AUTHORS: ReadonlySet<string> = new Set(["jowee"]);

const normalizeAuthor = (user: unknown): string =>
  typeof user === "string" ? user.trim().toLowerCase() : "";

export const isImportBlocked = (
  deck: Pick<DeckImportType, "user"> | null | undefined,
): boolean => {
  const author = normalizeAuthor(deck?.user);
  return author !== "" && BLOCKED_AUTHORS.has(author);
};

export const blockedAuthorMessage = (user: string): string =>
  `Decks by ${user.trim()} can't be imported — the author has asked that their decks not be importable into Unbrewed.`;
