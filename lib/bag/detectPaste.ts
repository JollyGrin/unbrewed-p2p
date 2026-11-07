/**
 * The Decks tab's universal paste bar (#1538): work out what the player
 * pasted so the right import panel opens without them choosing a method.
 *
 * Checked in this order:
 *   1. Unmatched Labs — an unmatchedlabs.com link, a `labs:` / `labs-` /
 *      `char_` id, or a bare set slug (Labs mints 24-hex slugs; a bare word
 *      shorter than {@link LABS_SLUG_MIN} is taken for an unmatched.cards
 *      code instead). `shared/<slug>` counts only on the Labs host: a
 *      Drive link has that path too.
 *   2. unmatched.cards — a deck URL (`/decks/<code>`) or a bare code. The
 *      site mints 4–5 character base-62 ids (every evergreen code in
 *      public/evergreen-decks is 4 or 5: `pk1x`, `x2_V`, `NQ5XP`), and
 *      every one carries a digit or mixed case. So a bare paste is a code
 *      when it is 4–5 url-safe characters and not a plain lowercase word:
 *      `hello`, `medusa` or `garbage` would otherwise fetch, toast an error
 *      and count as a failed add. (An all-lowercase code is possible —
 *      about 3% of 4-letter ids — and such a player can paste the deck URL.)
 *   3. JSON — a backup bundle / deck array / single deck
 *      ({@link normalizeBundle}), else a Tabletop Simulator export
 *      ({@link parseTtsDeck}; that's how the-unmatched.club decks arrive).
 *   4. the-unmatched.club — a hero page link (`/c/heroes/<slug>.<id>`),
 *      fetched through the API proxy ({@link parseClubLink}); any other
 *      club link has no deck id to fetch, so the panel says what to paste.
 *   5. Any other http(s) link — fetched, in case it serves deck JSON (the
 *      old "From URL" import); the panel decides from the body.
 *   6. Anything else is not a deck we recognise.
 */
import { parseClubLink } from "@/lib/club/decode";
import { LabsInput, parseLabsInput } from "@/lib/labs/parse";
import { parseTtsDeck } from "@/lib/tts/parse-tts";
import { BulkBundle, normalizeBundle, parseJson } from "./bundle";

export type PasteDetection =
  | { kind: "empty" }
  | { kind: "labs"; link: string; input: LabsInput }
  | { kind: "code"; code: string }
  | { kind: "bundle"; text: string; bundle: BulkBundle }
  | { kind: "tts"; text: string; cardCount: number; name?: string }
  | { kind: "club"; id?: string }
  | { kind: "url"; url: string }
  | { kind: "unknown"; looksLikeJson: boolean };

const LABS_HOST = /unmatchedlabs\.com/i;
const CLUB_HOST = /the-unmatched\.club/i;
const CARDS_URL = /unmatched\.cards\/(?:decks|deck)\/([A-Za-z0-9_-]+)/i;
// unmatched.cards codes: 4–5 url-safe characters, e.g. `pk1x`, `x2_V`, `NQ5XP`.
const BARE_CODE = /^[A-Za-z0-9_-]{4,5}$/;
const LOWERCASE_WORD = /^[a-z]+$/;
const BARE_WORD = /^[A-Za-z0-9_-]+$/;
const HTTP_URL = /^https?:\/\/\S+$/i;
const LABS_SLUG_MIN = 16;

/** A bare unmatched.cards code, as the site mints them (see the header). */
export const isBareCardsCode = (text: string): boolean =>
  BARE_CODE.test(text) && !LOWERCASE_WORD.test(text);

export const detectDeckPaste = (raw: string): PasteDetection => {
  const text = raw.trim();
  if (!text) return { kind: "empty" };

  if (text.startsWith("{") || text.startsWith("[")) {
    const parsed = parseJson(text);
    if (parsed === undefined) return { kind: "unknown", looksLikeJson: true };
    const bundle = normalizeBundle(parsed);
    if (bundle) return { kind: "bundle", text, bundle };
    const tts = parseTtsDeck(parsed);
    if (tts.cards.length > 0) {
      return { kind: "tts", text, cardCount: tts.cards.length, name: tts.name };
    }
    return { kind: "unknown", looksLikeJson: true };
  }

  const labs = parseLabsInput(text);
  const isBareWord = BARE_WORD.test(text);
  if (
    labs &&
    (LABS_HOST.test(text) ||
      labs.kind === "character" ||
      (isBareWord && text.length >= LABS_SLUG_MIN))
  ) {
    return { kind: "labs", link: text, input: labs };
  }

  const cardsUrl = CARDS_URL.exec(text);
  if (cardsUrl) return { kind: "code", code: cardsUrl[1] };
  if (CLUB_HOST.test(text)) return { kind: "club", id: parseClubLink(text) };
  if (isBareCardsCode(text)) return { kind: "code", code: text };
  if (HTTP_URL.test(text)) return { kind: "url", url: text };

  return { kind: "unknown", looksLikeJson: false };
};
