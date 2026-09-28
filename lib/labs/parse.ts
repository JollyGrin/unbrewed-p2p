/**
 * Turn whatever a player pastes into the Labs panel into something we can
 * fetch. Accepted, in any surrounding whitespace:
 *
 *   https://www.unmatchedlabs.com/shared/<slug>                    → a set
 *   https://www.unmatchedlabs.com/shared/<slug>?character=char_…   → a character
 *   https://www.unmatchedlabs.com/#/shared/<slug>                  → a set
 *   char_<uuid>                                                    → a character
 *   labs-char_<uuid> / labs:char_<uuid>  (our own deck id / deep link form)
 *   <slug>                                                         → a set
 */

export type LabsInput =
  | { kind: "character"; characterId: string; slug?: string }
  | { kind: "set"; slug: string };

const CHARACTER_ID = /char_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
// Labs' own route pattern for a share slug (`/shared/<slug>`).
const SHARED_PATH = /shared\/([A-Za-z0-9_-]+)/;
// A bare slug. Labs mints 24-hex slugs today; the floor keeps short words out.
const BARE_SLUG = /^[A-Za-z0-9_-]{8,64}$/;

export const parseLabsInput = (raw: string): LabsInput | null => {
  const input = raw?.trim();
  if (!input) return null;

  const slug = SHARED_PATH.exec(input)?.[1];
  const character = CHARACTER_ID.exec(input)?.[0];
  if (character) {
    return { kind: "character", characterId: character.toLowerCase(), slug };
  }
  if (slug) return { kind: "set", slug };
  if (BARE_SLUG.test(input) && !/^(labs|char)[_:-]/i.test(input)) {
    return { kind: "set", slug: input };
  }
  return null;
};

/**
 * Bag id for a deck imported from Labs.
 *
 * `labs-` + the Labs character id, e.g. `labs-char_ce316d14-…`. unmatched.cards
 * ids are short alphanumeric codes (`pk1x`) and image decks are `img-…`, so
 * the prefix can never collide with either, and because it is derived from
 * the character (not the set revision or a random suffix) re-importing the
 * same character overwrites the bag entry instead of duplicating it.
 */
export const labsDeckId = (characterId: string) => `labs-${characterId}`;

export const isLabsDeckId = (id: string | undefined): boolean =>
  !!id && id.startsWith("labs-") && CHARACTER_ID.test(id);

export const labsShareUrl = (slug: string, characterId?: string) =>
  `https://www.unmatchedlabs.com/shared/${slug}` +
  (characterId ? `?character=${characterId}` : "");
