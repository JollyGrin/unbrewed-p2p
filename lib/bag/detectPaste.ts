/**
 * The Decks tab's universal paste bar (#1538): work out what the player
 * pasted so the right import panel opens without them choosing a method.
 *
 * Checked in this order:
 *   1. Unmatched Labs — an unmatchedlabs.com link, a `labs:` / `labs-` /
 *      `char_` id, or a bare set slug (Labs mints 24-hex slugs; a bare word
 *      shorter than {@link LABS_SLUG_MIN} is taken for an unmatched.cards
 *      code instead, which are 4–6 characters).
 *   2. unmatched.cards — a deck URL (`/decks/<code>`) or a bare code.
 *   3. JSON — a backup bundle / deck array / single deck
 *      ({@link normalizeBundle}), else a Tabletop Simulator export
 *      ({@link parseTtsDeck}; that's how the-unmatched.club decks arrive).
 *   4. A the-unmatched.club page link: nothing to fetch there, say so.
 *   5. Anything else is not a deck we recognise.
 */
import { LabsInput, parseLabsInput } from "@/lib/labs/parse";
import { parseTtsDeck } from "@/lib/tts/parse-tts";
import { BulkBundle, normalizeBundle, parseJson } from "./bundle";

export type PasteDetection =
  | { kind: "empty" }
  | { kind: "labs"; link: string; input: LabsInput }
  | { kind: "code"; code: string }
  | { kind: "bundle"; text: string; bundle: BulkBundle }
  | { kind: "tts"; text: string; cardCount: number; name?: string }
  | { kind: "club" }
  | { kind: "unknown"; looksLikeJson: boolean };

const LABS_HOST = /unmatchedlabs\.com/i;
const CLUB_HOST = /the-unmatched\.club/i;
const CARDS_URL = /unmatched\.cards\/(?:decks|deck)\/([A-Za-z0-9_-]+)/i;
// unmatched.cards codes: 4+ url-safe characters, e.g. `pk1x`, `x2_V`, `lB-k`.
const BARE_CODE = /^[A-Za-z0-9_-]{4,}$/;
const LABS_SLUG_MIN = 16;

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
  const isBareWord = BARE_CODE.test(text);
  if (
    labs &&
    (LABS_HOST.test(text) ||
      labs.kind === "character" ||
      !isBareWord ||
      text.length >= LABS_SLUG_MIN)
  ) {
    return { kind: "labs", link: text, input: labs };
  }

  const cardsUrl = CARDS_URL.exec(text);
  if (cardsUrl) return { kind: "code", code: cardsUrl[1] };
  if (CLUB_HOST.test(text)) return { kind: "club" };
  if (isBareWord) return { kind: "code", code: text };

  return { kind: "unknown", looksLikeJson: false };
};
