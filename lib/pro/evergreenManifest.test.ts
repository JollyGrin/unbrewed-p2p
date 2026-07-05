import { readFileSync } from "node:fs";
import { join } from "node:path";
import { computeDigest } from "../../scripts/lib/deckManifest";
import { EVERGREEN_MANIFEST } from "./evergreenManifest";
import { HERO_DECK_IDS } from "./useProCardArt";

const DECKS_DIR = join(__dirname, "..", "..", "public", "evergreen-decks");

const readDeck = (deckId: string) =>
  JSON.parse(readFileSync(join(DECKS_DIR, `${deckId}.json`), "utf8"));

describe("evergreen deck rules lock", () => {
  it("matches the committed manifest digest for every evergreen deck", () => {
    for (const entry of EVERGREEN_MANIFEST) {
      const deck = readDeck(entry.deckId);
      expect(computeDigest(deck)).toBe(entry.digest);
    }
  });

  it("has a manifest entry for every hero <-> deck id present in HERO_DECK_IDS", () => {
    const manifestDeckIds = new Set(EVERGREEN_MANIFEST.map((e) => e.deckId));
    for (const deckId of Object.values(HERO_DECK_IDS)) {
      expect(manifestDeckIds.has(deckId)).toBe(true);
    }
  });

  it("does not change digest on a presentation-only edit (image/appearance/note)", () => {
    const entry = EVERGREEN_MANIFEST[0];
    const deck = readDeck(entry.deckId);
    const edited = JSON.parse(JSON.stringify(deck));
    edited.deck_data.appearance.cardbackUrl = "https://example.com/new-cardback.png";
    edited.deck_data.cards[0].imageUrl = "https://example.com/new-card-art.png";
    edited.note = "Completely different flavor text.";
    expect(computeDigest(edited)).toBe(computeDigest(deck));
  });

  it("changes digest on a rules-relevant edit (card value)", () => {
    const entry = EVERGREEN_MANIFEST[0];
    const deck = readDeck(entry.deckId);
    const edited = JSON.parse(JSON.stringify(deck));
    edited.deck_data.cards[0].value = (edited.deck_data.cards[0].value ?? 0) + 1;
    expect(computeDigest(edited)).not.toBe(computeDigest(deck));
  });
});
