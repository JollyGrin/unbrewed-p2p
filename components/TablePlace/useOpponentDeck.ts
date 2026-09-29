import { useState } from "react";
import type { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { fetchLinkedDeck } from "@/lib/deckLink";
import { opponentDeckLink } from "@/lib/tableplace/opponent";

/** The opponent seat's deck: one of your bag decks, or one pasted as a link. */
export const useOpponentDeck = () => {
  const [pasted, setPasted] = useState("");
  const [bagId, setBagId] = useState("");
  const [deck, setDeck] = useState<DeckImportType>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const load = async (fetcher: () => Promise<DeckImportType>) => {
    setLoading(true);
    setError(undefined);
    setDeck(undefined);
    try {
      setDeck(await fetcher());
    } catch {
      setError("Couldn't load that deck. Check the link and try again.");
    } finally {
      setLoading(false);
    }
  };

  const loadPasted = () => {
    setBagId("");
    const link = opponentDeckLink(pasted);
    if (!link) {
      setDeck(undefined);
      setError(
        "That isn't a deck link. Paste an unmatched.cards or Unmatched Labs link, or a deck id.",
      );
      return;
    }
    load(() => fetchLinkedDeck(link).then((r) => r.deck));
  };

  /** Pick from the bag's own list: already in hand, so nothing to fetch. */
  const pickBag = (id: string, decks: DeckImportType[]) => {
    setBagId(id);
    setError(undefined);
    setDeck(decks.find((d) => d.id === id));
  };

  return {
    pasted,
    setPasted,
    loadPasted,
    bagId,
    pickBag,
    deck,
    loading,
    error,
  };
};
