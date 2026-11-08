import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { MapData } from "@/lib/hooks/useLocalStorage";

export type BulkBundle = { decks: DeckImportType[]; maps: MapData[] };

/**
 * Accept a full backup bundle ({decks, maps}), a bare array of decks,
 * or a single deck object — people share all three shapes. Shared by the
 * Backup & Share tab and the Decks tab's paste bar (#1538).
 */
export const normalizeBundle = (parsed: unknown): BulkBundle | undefined => {
  if (!parsed || typeof parsed !== "object") return undefined;
  if (Array.isArray(parsed)) {
    const decks = parsed.filter((d) => d?.deck_data && d?.id);
    return decks.length ? { decks, maps: [] } : undefined;
  }
  const obj = parsed as Record<string, any>;
  if (obj.deck_data && obj.id) {
    return { decks: [obj as DeckImportType], maps: [] };
  }
  const decks = Array.isArray(obj.decks)
    ? obj.decks.filter((d: any) => d?.deck_data && d?.id)
    : [];
  const maps = Array.isArray(obj.maps)
    ? obj.maps.filter((m: any) => typeof m?.imgUrl === "string")
    : [];
  if (!decks.length && !maps.length) return undefined;
  return { decks, maps };
};

/** `undefined` for text that isn't JSON, never a throw. */
export const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};
