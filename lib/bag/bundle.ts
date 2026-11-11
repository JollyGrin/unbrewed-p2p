import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { isPlayableDeck } from "@/lib/decks/isPlayableDeck";
import { MapData } from "@/lib/hooks/useLocalStorage";

/**
 * `invalidDecks`: entries that looked like decks (an object with `deck_data`
 * and `id`) but fail {@link isPlayableDeck} (#1609). They are left out of
 * `decks`; the import panels say how many were skipped.
 */
export type BulkBundle = { decks: DeckImportType[]; maps: MapData[]; invalidDecks?: number };

const looksLikeDeck = (d: any): boolean => !!(d?.deck_data && d?.id);

/**
 * Accept a full backup bundle ({decks, maps}), a bare array of decks,
 * or a single deck object — people share all three shapes. Shared by the
 * Backup & Share tab and the Decks tab's paste bar (#1538).
 */
export const normalizeBundle = (parsed: unknown): BulkBundle | undefined => {
  if (!parsed || typeof parsed !== "object") return undefined;
  if (Array.isArray(parsed)) {
    const candidates = parsed.filter(looksLikeDeck);
    const decks = candidates.filter(isPlayableDeck);
    return decks.length
      ? { decks, maps: [], invalidDecks: candidates.length - decks.length }
      : undefined;
  }
  const obj = parsed as Record<string, any>;
  if (looksLikeDeck(obj)) {
    // A single malformed deck is not offered as a deck at all.
    return isPlayableDeck(obj) ? { decks: [obj], maps: [], invalidDecks: 0 } : undefined;
  }
  const candidates: unknown[] = Array.isArray(obj.decks) ? obj.decks.filter(looksLikeDeck) : [];
  const decks = candidates.filter(isPlayableDeck);
  const maps = Array.isArray(obj.maps)
    ? obj.maps.filter((m: any) => typeof m?.imgUrl === "string")
    : [];
  if (!decks.length && !maps.length) return undefined;
  return { decks, maps, invalidDecks: candidates.length - decks.length };
};

/** `undefined` for text that isn't JSON, never a throw. */
export const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};
