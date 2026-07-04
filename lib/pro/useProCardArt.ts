/**
 * Card ART for Pro games. The server's catalog is the mechanical truth
 * (title/type/value/boost); display art comes from the same public
 * unbrewed-api deck JSON the sandbox imports, matched by title. If a deck
 * fetch fails or a title doesn't match, callers fall back to text chips —
 * art is a nicety, never a dependency.
 */
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import {
  DeckImportCardType,
  DeckImportType,
} from "@/components/DeckPool/deck-import.type";
import { CardDefId, CardInstanceId, CardMeta } from "./protocol";

/** server hero id -> unmatched.cards deck id (the /pro roster source) */
export const HERO_DECK_IDS: Record<string, string> = {
  "king-kong": "kdKM",
  "baba-yaga": "yAJ-",
  "the-flash": "p1Ew",
};

const API = "https://unbrewed-api.vercel.app/api/unmatched-deck/";

const norm = (s: string) => s.trim().toLowerCase();

export type ResolveCard = (instance: CardInstanceId) => DeckImportCardType | null;

export function useProCardArt(
  heroIds: string[],
  catalog: Record<CardDefId, CardMeta>
): { resolveCard: ResolveCard; isLoading: boolean } {
  const ids = [...new Set(heroIds)].sort();

  const { data, isLoading } = useQuery(
    ["pro-card-art", ids.join(",")],
    async () => {
      const byHero: Record<string, Record<string, DeckImportCardType>> = {};
      await Promise.all(
        ids.map(async (heroId) => {
          const deckId = HERO_DECK_IDS[heroId];
          if (!deckId) return;
          const { data: deck } = await axios.get<DeckImportType>(API + deckId);
          const byTitle: Record<string, DeckImportCardType> = {};
          for (const card of deck.deck_data.cards) byTitle[norm(card.title)] = card;
          byHero[heroId] = byTitle;
        })
      );
      return byHero;
    },
    { enabled: ids.length > 0, staleTime: Infinity, retry: 1 }
  );

  const resolveCard: ResolveCard = (instance) => {
    const defId = instance.split("#")[0];
    const heroId = defId.split("/")[0];
    const meta = catalog[defId];
    if (!meta || !data?.[heroId]) return null;
    return data[heroId][norm(meta.title)] ?? null;
  };

  return { resolveCard, isLoading };
}
