/**
 * Full deck data (hero, sidekick, complete card list) for the hero-preview
 * modal shown before a hero is picked — no match exists yet at that point,
 * so this fetches by unmatched.cards deck id directly rather than going
 * through the catalog/instance matching useProCardArt does mid-game.
 *
 * Rules-locked heroes (DECK_HERO_IDS has an entry) are snapshot-only, same as
 * useProCardArt: public/evergreen-decks/<id>.json is the frozen art, and a
 * missing file is a build problem, not something to paper over with a live
 * fetch. Everything else — a community deck with no Pro rules yet — has no
 * lock to honor, so it falls back to the live unmatched-api; that's how a
 * not-yet-converted (locked) roster tile still gets a preview.
 */
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { DeckImportDataType, DeckImportType } from "@/components/DeckPool/deck-import.type";
import { DEFAULT_DECK_API } from "@/lib/evergreenDecks";
import { DECK_HERO_IDS } from "./useProCardArt";

export function useDeckPreview(deckId: string | null, enabled: boolean) {
  return useQuery<DeckImportDataType | null>(
    ["deck-preview", deckId],
    async () => {
      if (!deckId) return null;
      const snapshot = await axios
        .get<DeckImportType>(`/evergreen-decks/${deckId}.json`)
        .catch(() => null);
      if (snapshot) return snapshot.data.deck_data;
      if (DECK_HERO_IDS[deckId]) return null;
      const remote = await axios.get<DeckImportType>(DEFAULT_DECK_API + deckId).catch(() => null);
      return remote?.data.deck_data ?? null;
    },
    { enabled: enabled && !!deckId, staleTime: Infinity, retry: 1 }
  );
}
