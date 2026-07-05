/**
 * Typed accessor for the rules-lock manifest (public/evergreen-decks/manifest.json).
 * The manifest records, per evergreen deck, the version_id and date it was
 * frozen against unbrewed-pro-server's rules.ts, plus a digest a CI test
 * verifies hasn't drifted (see lib/pro/evergreenManifest.test.ts). Imported at
 * build time (resolveJsonModule) rather than fetched, so the UI stamp never
 * depends on a network round trip.
 */
import manifest from "@/public/evergreen-decks/manifest.json";

export type EvergreenManifestEntry = {
  heroId: string;
  deckId: string;
  version_id: string;
  frozenAt: string;
  digest: string;
  rulesVerified: {
    repo: string;
    file: string;
    commit: string;
  };
};

export const EVERGREEN_MANIFEST: EvergreenManifestEntry[] = manifest.decks;

const byHeroId = new Map(EVERGREEN_MANIFEST.map((e) => [e.heroId, e]));
const byDeckId = new Map(EVERGREEN_MANIFEST.map((e) => [e.deckId, e]));

export const frozenAtForHero = (heroId: string): string | null =>
  byHeroId.get(heroId)?.frozenAt ?? null;

export const frozenAtForDeck = (deckId: string): string | null =>
  byDeckId.get(deckId)?.frozenAt ?? null;
