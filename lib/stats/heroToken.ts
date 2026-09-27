/**
 * Hero token art for the stats pages: the deck snapshot's
 * `deck_data.hero.tokenImageUrl` (public/evergreen-decks/<deckId>.json), the
 * same source the Pro board draws its tokens from.
 *
 * One react-query entry PER HERO (`["hero-token", heroId]`, never stale), so a
 * page only downloads the snapshots of the heroes it actually shows, and every
 * later HeroToken for that hero — on the same page or the next — reads the
 * shared cache instead of refetching. A missing snapshot, a deck with no token
 * (Nancy Drew) or a known stub all resolve to `null` → the initials disc.
 */
import { useQuery } from "@tanstack/react-query";

import { HERO_DECK_IDS } from "@/lib/pro/useProCardArt";

/**
 * Tokens that exist on disk but are not art. Specter Knight's snapshot points
 * at a 544-byte placeholder webp (a blank square), which would draw an empty
 * circle where the initials disc is the honest answer. Remove an entry when
 * real art replaces the file.
 */
export const STUB_TOKEN_PATHS: ReadonlySet<string> = new Set([
  "/evergreen-decks/art/xBvn/token-specter-knight.webp",
]);

/** Our own origins: an absolute URL on them is served from this build's public/. */
const OWN_ORIGIN = /^https?:\/\/(www\.)?unbrewed\.xyz(?=\/)/i;

/**
 * Snapshot URL → the src to render, or null when there is no usable art.
 * Both forms occur in the snapshots: absolute `https://unbrewed.xyz/…` and
 * root-relative `/evergreen-decks/…`. The absolute form is made root-relative
 * so a local or preview build serves its own copy rather than prod's.
 */
export const resolveTokenSrc = (raw: string | null | undefined): string | null => {
  const url = raw?.trim();
  if (!url) return null;
  const src = url.replace(OWN_ORIGIN, "");
  if (!src.startsWith("/") && !/^https?:\/\//i.test(src)) return null;
  const path = src.startsWith("/") ? src.split(/[?#]/)[0] : null;
  if (path && STUB_TOKEN_PATHS.has(path)) return null;
  return src;
};

const fetchHeroTokenUrl = async (heroId: string): Promise<string | null> => {
  const deckId = HERO_DECK_IDS[heroId];
  if (!deckId) return null;
  try {
    const res = await fetch(`/evergreen-decks/${deckId}.json`);
    if (!res.ok) return null;
    const deck = (await res.json()) as {
      deck_data?: { hero?: { tokenImageUrl?: string | null } };
    };
    return resolveTokenSrc(deck.deck_data?.hero?.tokenImageUrl);
  } catch {
    return null;
  }
};

/**
 * The token src for one hero: `undefined` while loading, `null` when there is
 * no art (→ initials), else the URL.
 */
export const useHeroTokenUrl = (heroId: string | null | undefined): string | null | undefined => {
  const known = !!heroId && heroId in HERO_DECK_IDS;
  const { data } = useQuery(
    ["hero-token", heroId ?? ""],
    () => fetchHeroTokenUrl(heroId as string),
    { enabled: known, staleTime: Infinity, cacheTime: Infinity, retry: false },
  );
  if (!known) return null;
  return data;
};
