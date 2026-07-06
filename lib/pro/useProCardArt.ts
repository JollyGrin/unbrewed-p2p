/**
 * Card ART for Pro games. The server's catalog is the mechanical truth
 * (title/type/value/boost); display art comes from the rules-locked deck
 * snapshot in public/evergreen-decks/ (see public/evergreen-decks/manifest.json
 * and lib/pro/evergreenManifest.ts) — the ONLY source, no live-API fallback.
 * Every /pro hero has rules frozen server-side, so its deck art must be
 * equally frozen; a `npm run pro:decks:bump-rules` is required to move the
 * lock forward deliberately. If a snapshot fetch fails or a title doesn't
 * match, callers fall back to text chips — art is a nicety, never a
 * dependency.
 */
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import {
  DeckImportCardType,
  DeckImportHeroType,
  DeckImportType,
} from "@/components/DeckPool/deck-import.type";
import { CardDefId, CardInstanceId, CardMeta } from "./protocol";

/**
 * server hero id -> unmatched.cards deck id, for every hero with rules in
 * unbrewed-pro-server (data/heroes/*.rules.ts). This is the ONE hero<->deck
 * mapping for Pro — lib/evergreenDecks.ts derives its sandbox-parity set from
 * this same map instead of hand-keeping a second list. Only add an entry here
 * once the hero has a rules.ts on the server; a deck id with no rules has no
 * business being in the Pro roster.
 */
export const HERO_DECK_IDS: Record<string, string> = {
  "king-kong": "kdKM",
  "the-mandalorian": "lDOM",
  thrall: "pk1x",
  "r2-d2": "3jgd",
  "gingerbread-man": "LWNZ",
  triceratops: "1Y5J",
  "baba-yaga": "yAJ-",
  // Evergreen originals: no unmatched.cards page exists — the ids are ours, and
  // the snapshot in public/evergreen-decks/ is the ONLY source (the live-API
  // fetch 404s by design; snapshot-only means it is never consulted).
  "king-taranis": "taranis",
  thetis: "thetis",
  "piper-of-the-underroads": "piper",
  "hollow-oak": "hollow-oak",
};

/**
 * Inverse of HERO_DECK_IDS: unmatched.cards deck id -> server hero id. The ONE
 * place the landing (which speaks deck ids) crosses over to the game page (which
 * speaks server hero ids). Derived here so the mapping is never duplicated.
 */
export const DECK_HERO_IDS: Record<string, string> = Object.fromEntries(
  Object.entries(HERO_DECK_IDS).map(([heroId, deckId]) => [deckId, heroId])
);

/** Art-matching title normalization. Exported for the evergreen-manifest test
 * proving a title with exotic whitespace (Baba Yaga's " Iron Teeth" begins
 * with a NON-BREAKING SPACE in both the API snapshot and the engine rules.ts)
 * still matches: JS trim() strips U+00A0 on both sides. */
export const norm = (s: string) => s.trim().toLowerCase();

export type ResolveCard = (instance: CardInstanceId) => DeckImportCardType | null;
export type ResolveHero = (heroId: string) => DeckImportHeroType | null;

interface HeroArt {
  cards: Record<string, DeckImportCardType>;
  hero: DeckImportHeroType;
}

export function useProCardArt(
  heroIds: string[],
  catalog: Record<CardDefId, CardMeta>
): { resolveCard: ResolveCard; resolveHero: ResolveHero; isLoading: boolean } {
  const ids = [...new Set(heroIds)].sort();

  const { data, isLoading } = useQuery(
    ["pro-card-art", ids.join(",")],
    async () => {
      const byHero: Record<string, HeroArt> = {};
      await Promise.all(
        ids.map(async (heroId) => {
          const deckId = HERO_DECK_IDS[heroId];
          if (!deckId) return;
          // Snapshot only — no live-API fallback. A rules-locked hero's deck
          // art must be equally locked; a missing file is a build problem to
          // fix, not something to paper over with a live fetch.
          const res = await axios
            .get<DeckImportType>(`/evergreen-decks/${deckId}.json`)
            .catch(() => null);
          if (!res) return;
          const deck = res.data;
          const byTitle: Record<string, DeckImportCardType> = {};
          for (const card of deck.deck_data.cards) byTitle[norm(card.title)] = card;
          byHero[heroId] = { cards: byTitle, hero: deck.deck_data.hero };
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
    return data[heroId].cards[norm(meta.title)] ?? null;
  };

  const resolveHero: ResolveHero = (heroId) => data?.[heroId]?.hero ?? null;

  return { resolveCard, resolveHero, isLoading };
}
