/**
 * Bot-simulated balance digest for the hero-preview modal's "Balance
 * profile" section. Phase 2 (unbrewed-p2p-84) commits /public/pro/deck-stats.json
 * as a generated artifact, same pattern as /public/top-decks — until that
 * lands the fetch 404s and the section simply doesn't render.
 */
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

export interface DeckStatsEntry {
  archetype?: string;
  powerTier?: string;
  avgGameLengthTurns?: number;
  bestMatchup?: string;
  worstMatchup?: string;
  /** opponent server heroId -> one-liner, shown only once their pick is locked */
  vsHero?: Record<string, string>;
}

/** keyed by server heroId */
export type DeckStatsFile = Record<string, DeckStatsEntry>;

export function useDeckStats() {
  return useQuery<DeckStatsFile | null>(
    ["pro-deck-stats"],
    async () => {
      const res = await axios.get<DeckStatsFile>("/pro/deck-stats.json").catch(() => null);
      return res?.data ?? null;
    },
    { staleTime: Infinity, retry: 0 }
  );
}
