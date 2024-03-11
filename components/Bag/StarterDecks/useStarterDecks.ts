import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { useQuery, useQueries } from "@tanstack/react-query";
import axios from "axios";
import toast from "react-hot-toast";

export const useStarterDecks = (props: { enabled: boolean }) => {
  const deckKeys = Object.keys(BACKUP_DECKS);
  console.log({ deckKeys });

  const queries = useQueries({
    queries: deckKeys.map((id) => ({
      queryKey: ["starter-deck", id],
      queryFn: () => fetchDeck(BACKUP_DECKS[id as BACKUP_KEY]),
      enabled: props.enabled,
    })),
  });

  return queries;
};

async function fetchDeck(url: string) {
  try {
    const result = await axios.get<DeckImportType>(url);
    return result.data;
  } catch (err) {
    console.error(err);
  }
}

type BACKUP_KEY = keyof typeof BACKUP_DECKS;
enum BACKUP_DECKS {
  THRALL = "https://arweave.net/OCa_LQ9vLH7ucJqVsxPYScaVoZL7btnzaRioH7rZjdw",
  MANDOLORIAN = "https://arweave.net/iQKZY8HNihjGO0wt6pHGxo6uD-9416-24X65WCzL68g",
  GINGER = "https://arweave.net/5vbOUVYkn1GUIPbpZdORslk10kT--Pt4KKziQYDIqcU",
  JOHNWICK = "https://arweave.net/z46jYDgrKBQT8bA_NqC5BJkWD6GFkWUFLKXRO8sAj_4",
  FRANKEN = "https://arweave.net/Nh3KzSYPTVhxXzV4N0YQ9YLHhkXQxxs-2wSwj7Xr12w",
}
