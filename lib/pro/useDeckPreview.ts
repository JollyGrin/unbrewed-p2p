/**
 * Full deck data (hero, sidekick, complete card list) for the hero-preview
 * modal shown before a hero is picked — no match exists yet at that point,
 * so this fetches by unmatched.cards deck id directly rather than going
 * through the catalog/instance matching useProCardArt does mid-game.
 * Snapshot-first, same as useProCardArt: public/pro/decks/<id>.json is
 * read before falling back to the live unmatched-api.
 */
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { DeckImportDataType, DeckImportType } from "@/components/DeckPool/deck-import.type";

const API = "https://unbrewed-api.vercel.app/api/unmatched-deck/";

export function useDeckPreview(deckId: string | null, enabled: boolean) {
  return useQuery<DeckImportDataType | null>(
    ["deck-preview", deckId],
    async () => {
      if (!deckId) return null;
      const local = await axios
        .get<DeckImportType>(`/pro/decks/${deckId}.json`)
        .catch(() => null);
      const envelope =
        local ?? (await axios.get<DeckImportType>(API + deckId).catch(() => null));
      return envelope?.data.deck_data ?? null;
    },
    { enabled: enabled && !!deckId, staleTime: Infinity, retry: 1 }
  );
}
