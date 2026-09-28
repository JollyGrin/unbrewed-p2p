/**
 * `?deckId=` deep links (/offline, /irl): which site a linked deck comes from,
 * what id it will have in the bag, and how to fetch it. The one place that
 * routes a link to a source — `useUnmatchedDeck` calls this, the pages only
 * ask {@link deckLinkBagId} what to look for in the bag.
 *
 *   ?deckId=<id>                → unmatched.cards (every link already out there)
 *   ?deckId=labs:char_<uuid>    → one Unmatched Labs character (#979)
 *
 * A bag id (`labs-char_<uuid>`) is accepted as a Labs link too, since
 * unmatched.cards never mints one. A Labs set slug is not: a set can hold
 * several heroes, and without a character the bag id isn't known before the
 * fetch, so "already in the bag, skip the fetch" couldn't hold.
 *
 * A Labs deck already in the bag is still refetched (#996), behind the saved
 * copy: see {@link refreshedDeck} and `useDeckLink`.
 */
import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { refreshSavedTokens } from "@/lib/deckRefresh";
import { fetchDeckById } from "@/lib/evergreenDecks";
import {
  LabsUnsupportedFeature,
  fail,
  fetchLabsImport,
  LabsSkippedContent,
  isLabsDeckId,
  labsDeckId,
  parseLabsInput,
} from "@/lib/labs";

export const LABS_LINK_PREFIX = "labs:";

export type DeckLink =
  | { source: "unmatched"; id: string }
  | { source: "labs"; characterId: string };

export type LinkedDeck = {
  deck: DeckImportType;
  /** Labs features the card template can't draw; empty for unmatched.cards */
  unsupported: LabsUnsupportedFeature[];
  /** What a Labs set holds that the import leaves behind; never holds the link */
  skipped: LabsSkippedContent;
};

/** `null` for a `labs:` link that doesn't name a character. */
export const parseDeckLink = (raw: string): DeckLink | null => {
  const id = raw.trim();
  const isLabs = id.toLowerCase().startsWith(LABS_LINK_PREFIX) || isLabsDeckId(id);
  if (!isLabs) return { source: "unmatched", id: raw };
  const input = parseLabsInput(id);
  return input?.kind === "character"
    ? { source: "labs", characterId: input.characterId }
    : null;
};

/** The id the linked deck has (or will have) in the bag. */
export const deckLinkBagId = (raw: string): string => {
  const link = parseDeckLink(raw);
  return link?.source === "labs" ? labsDeckId(link.characterId) : raw;
};

/** Does this bag deck satisfy the link? */
export const deckMatchesLink = (
  deck: Pick<DeckImportType, "id" | "version_id"> | undefined,
  raw: string,
): boolean => {
  if (!deck) return false;
  const id = deckLinkBagId(raw);
  return deck.id === id || deck.version_id === id;
};

/** Fetch the linked deck from its source. Rejects on a refused or bad link. */
export const fetchLinkedDeck = async (
  raw: string,
  fetchImpl?: typeof fetch,
): Promise<LinkedDeck> => {
  const link = parseDeckLink(raw);
  if (!link) return fail("bad-input");
  if (link.source === "unmatched") {
    return { deck: await fetchDeckById(link.id), unsupported: [], skipped: [] };
  }
  const { deck, unsupported, skipped } = await fetchLabsImport(
    { kind: "character", characterId: link.characterId },
    fetchImpl,
  );
  return { deck, unsupported, skipped };
};

/**
 * Is this a Labs link? Those are refetched even when the deck is in the bag
 * (#996): Labs decks get edited, and the link should open the current one.
 * An unmatched.cards link in the bag is played as saved, never refetched.
 */
export const isLabsLink = (raw: string): boolean =>
  parseDeckLink(raw)?.source === "labs";

const imageUrls = (deck: DeckImportType): string[] => {
  const cards = deck.deck_data?.cards ?? [];
  return [
    deck.deck_data?.appearance?.cardbackUrl ?? "",
    ...cards.map((c) => `${c.cardImage?.url ?? c.imageUrl ?? ""}|${c.cardBackUrl ?? ""}`),
  ];
};

/**
 * Same Labs revision and the same card images: nothing to update. The images
 * are compared as well as the revision because Labs re-renders every card
 * when it changes its renderer (`card_preview_version`), and that leaves the
 * set's revision where it was.
 */
export const isSameDeckVersion = (
  saved: DeckImportType,
  fetched: DeckImportType,
): boolean =>
  saved.version_id === fetched.version_id &&
  JSON.stringify(imageUrls(saved)) === JSON.stringify(imageUrls(fetched));

/**
 * The bag entry a refresh writes: the fetched deck, carrying over what the
 * player set on their saved copy. `null` when there is nothing to update.
 *
 * Kept from the saved copy: `savedTokens` (hero-card tokens pointed at the new
 * renders; a token the player removed stays removed) and `savedTokenColor`.
 * The id is the same, so the star is too. Everything else is the fetched deck.
 */
export const refreshedDeck = (
  saved: DeckImportType,
  fetched: DeckImportType,
): DeckImportType | null => {
  if (isSameDeckVersion(saved, fetched)) return null;
  const { savedTokens: seeded, savedTokenColor: _, ...rest } = fetched;
  const savedTokens = saved.savedTokens
    ? refreshSavedTokens(saved.savedTokens, { from: saved, to: fetched })
    : seeded;
  return {
    ...rest,
    ...(savedTokens ? { savedTokens } : {}),
    ...(saved.savedTokenColor !== undefined
      ? { savedTokenColor: saved.savedTokenColor }
      : {}),
  };
};
