import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useDebounce } from "use-debounce";
import { useLocalDeckStorage } from "./useLocalStorage";
import { DEFAULT_DECK_API, fetchDeckById } from "@/lib/evergreenDecks";

export const useUnmatchedDeck = () => {
  const [deckId, setDeckId] = useState<string>();
  const [deckIdDebounced] = useDebounce(deckId, 300);
  const [apiUrl, setApiUrl] = useState<string>(DEFAULT_DECK_API);

  const { data, isLoading, error } = useQuery(
    ["deck", deckIdDebounced, apiUrl],
    async () => {
      try {
        // Default API → evergreen-aware fetch (Pro rule-enforced decks pin to
        // the committed snapshot). A custom apiUrl bypasses it deliberately.
        if (apiUrl === DEFAULT_DECK_API) {
          return await fetchDeckById(deckIdDebounced!);
        }
        const result = await axios.get<DeckImportType>(
          apiUrl + deckIdDebounced,
        );
        return result.data;
      } catch (err) {
        console.error(err);
        // rethrow so react-query marks the query as errored instead of
        // silently resolving with `data: undefined`
        throw err;
      }
    },
    {
      enabled: !!deckIdDebounced,
      retry: false,
      onSuccess: (e) => toast.success("Deck fetched!"),
      onError: (e) => toast.error("Error fetching deck"),
    },
  );

  return {
    data,
    isLoading,
    error,
    deckId: deckIdDebounced,
    setDeckId,
    apiUrl,
    setApiUrl,
  };
};

/**
 * Load the deckId from router.query and star it
 * useful for quickly loading and jumping into a game
 * this can be dropped in without props as it pulls from the url bar
 * and manipulates localstorage
 * */
export const useLoadRouterDeck = () => {
  const { query, reload } = useRouter();
  const deckId = query.deckId as string | undefined;

  const { data, isLoading: fetchIsLoading, error, setDeckId } = useUnmatchedDeck();
  const { decks, pushDeck, setStar } = useLocalDeckStorage();
  // Tracks the whole import window — from the moment we decide a reload is
  // needed until it actually fires — so the UI never falls back to the empty
  // "no deck selected" placeholder in between (covers the setDeckId debounce
  // gap that fetchIsLoading alone would miss).
  const [isImporting, setIsImporting] = useState(false);
  const [importFailed, setImportFailed] = useState(false);

  useEffect(() => {
    if (!deckId) return;

    // check if query.deckId is one of the existing local decks
    const deckIdsInStorage = decks
      ?.map((deck) => [deck.id, deck.version_id])
      .flat();
    if (deckIdsInStorage?.includes(deckId)) {
      // if it is, check the local decks for a matching id
      const localDeck = decks?.find(
        (deck) => deck.version_id === deckId || deck.id === deckId,
      );

      if (localDeck?.version_id !== deckId) {
        setIsImporting(true);
        toast.success("Refresh the page if you do not see your new deck");
        reload()
      }
      // star the local deck
      if (localDeck) setStar(localDeck.id);
      return;
    }

    // if there's no local deck, set the deckId to fetch from api
    setIsImporting(true);
    setDeckId(deckId);
  }, [deckId]);

  useEffect(() => {
    if (!deckId) return;
    if (error) {
      setIsImporting(false);
      setImportFailed(true);
    }
  }, [error, deckId]);

  useEffect(() => {
    if (!data) return;
    if (!deckId) return;

    // once api data is available, push the deck to local storage and star it
    pushDeck(data);
    setStar(data.id);
    toast.success("Success! Refreshing page to load new deck");
    reload();
  }, [data]);

  return {
    isLoading: isImporting || fetchIsLoading,
    error: importFailed,
  };
};
