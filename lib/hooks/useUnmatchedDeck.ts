import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import toast from "react-hot-toast";
import { useDebounce } from "use-debounce";

export const useUnmatchedDeck = () => {
  const [deckId, setDeckId] = useState<string>();
  const [deckIdDebounced] = useDebounce(deckId, 300);
  const [apiUrl, setApiUrl] = useState<string>(
    "https://unbrewed-api.vercel.app/api/unmatched-deck/"
  );

  const { data, isLoading, error } = useQuery(
    ["deck", deckIdDebounced, apiUrl],
    async () => {
      try {
        const result = await axios.get(apiUrl + deckIdDebounced);
        return result.data;
      } catch (err) {
        console.error(err);
      }
    },
    {
      enabled: !!deckIdDebounced,
      onSuccess: (e) => toast.success("Deck fetched!"),
      onError: (e) => toast.error("Error fetching deck"),
    }
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
