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
 */
import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { fetchDeckById } from "@/lib/evergreenDecks";
import {
  LabsUnsupportedFeature,
  fail,
  fetchLabsImport,
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
export const fetchLinkedDeck = async (raw: string): Promise<LinkedDeck> => {
  const link = parseDeckLink(raw);
  if (!link) return fail("bad-input");
  if (link.source === "unmatched") {
    return { deck: await fetchDeckById(link.id), unsupported: [] };
  }
  const { deck, unsupported } = await fetchLabsImport({
    kind: "character",
    characterId: link.characterId,
  });
  return { deck, unsupported };
};
