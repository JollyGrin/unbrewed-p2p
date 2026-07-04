#!/usr/bin/env node
/**
 * snapshot-pro-decks.mjs — evergreen deck-art snapshots for /pro.
 *
 * The Pro server owns the RULES for each deck (frozen at conversion time in
 * its data/heroes/*.rules.ts); the client only needs the community deck JSON
 * for card ART + hero images. Fetching that from unbrewed-api at runtime
 * means upstream edits or outages change/break the display of decks whose
 * rules can't change anyway. So: snapshot the deck JSON per hero into
 *   public/pro/decks/<deckId>.json
 * and let useProCardArt read the committed snapshot first (API is only a
 * fallback for decks not yet snapshotted). Card/hero image URLs inside the
 * JSON stay external (imgur etc.) — this snapshots the JSON only, same
 * URLs-only policy as image decks.
 *
 * The deck list is parsed from HERO_DECK_IDS in lib/pro/useProCardArt.ts so
 * there is one source of truth. Re-run after adding a hero there:
 *   npm run pro:decks:snapshot
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "public", "pro", "decks");
const IDS_SOURCE = join(ROOT, "lib", "pro", "useProCardArt.ts");
const API = "https://unbrewed-api.vercel.app/api/unmatched-deck/";

// Local patches applied on top of the fetched JSON — self-hosted art the
// upstream deck doesn't carry. Without this, a re-run would silently drop it.
const OVERRIDES = {
  pk1x: (deck) => {
    deck.deck_data.appearance.cardbackUrl = "https://unbrewed.xyz/cardbacks/thrall.webp";
  },
};

const src = await readFile(IDS_SOURCE, "utf8");
const block = src.match(/HERO_DECK_IDS[^=]*=\s*\{([^}]*)\}/)?.[1];
if (!block) {
  console.error(`Could not find HERO_DECK_IDS in ${IDS_SOURCE}`);
  process.exit(1);
}
const entries = [...block.matchAll(/["']?([\w-]+)["']?\s*:\s*["']([^"']+)["']/g)].map(
  (m) => ({ heroId: m[1], deckId: m[2] })
);
if (entries.length === 0) {
  console.error("HERO_DECK_IDS parsed to zero entries — check the regex against the file");
  process.exit(1);
}

await mkdir(OUT_DIR, { recursive: true });
let failures = 0;
for (const { heroId, deckId } of entries) {
  try {
    const res = await fetch(API + deckId);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const deck = await res.json();
    const cards = deck?.deck_data?.cards;
    if (!Array.isArray(cards) || cards.length === 0) {
      throw new Error("response has no .deck_data.cards — API shape changed?");
    }
    OVERRIDES[deckId]?.(deck);
    await writeFile(join(OUT_DIR, `${deckId}.json`), JSON.stringify(deck, null, 2));
    console.log(`✓ ${heroId} (${deckId}): ${cards.length} cards, hero "${deck.deck_data.hero?.name}"`);
  } catch (err) {
    failures += 1;
    console.error(`✗ ${heroId} (${deckId}): ${err.message}`);
  }
}
if (failures > 0) {
  console.error(`\n${failures} deck(s) failed — existing snapshots for them are left untouched.`);
  process.exit(1);
}
console.log(`\nSnapshotted ${entries.length} decks to public/pro/decks/`);
