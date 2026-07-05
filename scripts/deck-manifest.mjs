#!/usr/bin/env node
/**
 * deck-manifest.mjs — rules-lock for the evergreen deck snapshots in
 * public/evergreen-decks/.
 *
 * Every hero with rules in unbrewed-pro-server (data/heroes/*.rules.ts) has
 * exactly one canonical deck JSON here, plus an entry in manifest.json
 * recording its version_id, the date its rules were frozen, and a digest
 * over the rules-relevant projection (card titles/types/values/boosts/
 * quantities, hero hp/move/reach, sidekick — see scripts/lib/deckManifest.js).
 * Presentation fields (art, appearance, notes) are NOT covered by the digest
 * and can be edited freely.
 *
 * This script never touches the network — it only ever reads what's already
 * committed. Two modes:
 *
 *   node scripts/deck-manifest.mjs verify
 *     Recompute each deck's digest from its on-disk JSON and compare against
 *     manifest.json. Exits 1 on any mismatch. (Same check as the CI test in
 *     lib/pro/evergreenManifest.test.ts — run this for a quick local check.)
 *
 *   node scripts/deck-manifest.mjs bump-rules <deckId> [<deckId>...]
 *     After you've deliberately hand-edited a snapshot's rules-relevant
 *     fields to mirror a rules.ts change, recompute its digest and stamp
 *     today's date as the new frozenAt. This is the ONLY way the lock moves
 *     forward — there is no re-fetch-from-API path anymore.
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { computeDigest } from "./lib/deckManifest.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DECKS_DIR = join(ROOT, "public", "evergreen-decks");
const MANIFEST_PATH = join(DECKS_DIR, "manifest.json");

const readManifest = async () => JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
const readDeck = async (deckId) =>
  JSON.parse(await readFile(join(DECKS_DIR, `${deckId}.json`), "utf8"));

const todayIso = () => new Date().toISOString().slice(0, 10);

async function verify() {
  const manifest = await readManifest();
  let drift = 0;
  for (const entry of manifest.decks) {
    const deck = await readDeck(entry.deckId);
    const actual = computeDigest(deck);
    if (actual !== entry.digest) {
      drift += 1;
      console.error(
        `✗ ${entry.heroId} (${entry.deckId}): digest drift\n    manifest: ${entry.digest}\n    actual:   ${actual}`
      );
    } else {
      console.log(`✓ ${entry.heroId} (${entry.deckId}): locked`);
    }
  }
  if (drift > 0) {
    console.error(
      `\n${drift} deck(s) drifted from the rules lock. If this is a deliberate rules change, edit the JSON to match the new rules.ts, then run:\n  node scripts/deck-manifest.mjs bump-rules <deckId>`
    );
    process.exit(1);
  }
  console.log(`\nAll ${manifest.decks.length} evergreen decks match their rules lock.`);
}

async function bumpRules(deckIds) {
  if (deckIds.length === 0) {
    console.error("Usage: node scripts/deck-manifest.mjs bump-rules <deckId> [<deckId>...]");
    process.exit(1);
  }
  const manifest = await readManifest();
  const today = todayIso();
  for (const deckId of deckIds) {
    const entry = manifest.decks.find((d) => d.deckId === deckId);
    if (!entry) {
      console.error(`✗ ${deckId}: no manifest entry — is this an evergreen deck id?`);
      process.exit(1);
    }
    const deck = await readDeck(deckId);
    const newDigest = computeDigest(deck);
    const changed = newDigest !== entry.digest;
    entry.digest = newDigest;
    entry.version_id = deck.version_id ?? entry.version_id;
    entry.frozenAt = today;
    console.log(
      `${changed ? "✓" : "•"} ${entry.heroId} (${deckId}): lock ${
        changed ? "moved forward" : "re-stamped (digest unchanged)"
      }, frozenAt=${today}`
    );
  }
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`\nWrote ${MANIFEST_PATH}`);
}

const [mode, ...rest] = process.argv.slice(2);
if (mode === "bump-rules") {
  await bumpRules(rest);
} else if (mode === "verify" || !mode) {
  await verify();
} else {
  console.error(`Unknown mode "${mode}". Use "verify" or "bump-rules <deckId>...".`);
  process.exit(1);
}
