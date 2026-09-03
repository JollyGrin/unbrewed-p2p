#!/usr/bin/env node
/**
 * wire-deck.mjs — the data half of wiring a converted deck into Unbrewed Pro
 * (see .claude/skills/wire-pro-deck/SKILL.md). Idempotent: re-running with the
 * same args changes nothing; running with changed args updates only the touched
 * fields. Steps, each printed as it runs:
 *
 *   1. Snapshot   public/evergreen-decks/<deckId>.json — fetched from the deck
 *                 API if absent; never overwritten when present (a one-line
 *                 diff vs the API is printed instead, since hand-edited
 *                 snapshots are canonical).
 *   2. Manifest   stub entry in public/evergreen-decks/manifest.json, then
 *                 `node scripts/deck-manifest.mjs bump-rules <deckId>` fills
 *                 in the real digest + frozenAt (reused, not re-derived).
 *   3. HERO_DECK_IDS in lib/pro/useProCardArt.ts — the ONE hero<->deck map.
 *   4. POPULAR_DECKS  in lib/constants/top-decks.ts — current shape per the
 *                 lab decks (see PopularDeckMeta); --tier defaults to `lab`
 *                 because every new deck starts in lab.
 *   5. Verify     `npm run pro:decks:verify` + jest evergreenManifest.test.ts.
 *
 * Transactional planning: every edit is resolved (every anchor found, every
 * payload built) and printed as one diff BEFORE a single byte is written. If
 * any step can't resolve its edit, the script aborts having written nothing —
 * check `git status` should come back clean. Writes themselves are NOT rolled
 * back: if step 5 (verify) or the bump-rules re-stamp fails, steps 1–4's
 * writes stay on disk. That's intended — fix the cause and re-run (the script
 * is idempotent), or `git checkout` the touched files to abandon.
 *
 * Edits are string inserts anchored on the existing entries' formatting. If an
 * anchor is missing the script aborts with the file and the expected anchor —
 * it never guesses a location. --dry-run prints the would-be diff, writes
 * nothing, exits 0.
 *
 * What this script deliberately does NOT do: art drops, hand-authored
 * originals (no API page — author the snapshot yourself first), deck-specific
 * snapshot hand-edits (a fetched snapshot is the API payload; re-apply known
 * hand-edits from git history if you're rebuilding a lost file), cardback
 * appearance patches inside the snapshot, token art, and the browser
 * verification. Those stay manual — see the skill.
 */
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DECKS_DIR = join(ROOT, "public", "evergreen-decks");
const MANIFEST_PATH = join(DECKS_DIR, "manifest.json");
const USE_PRO_CARD_ART = join(ROOT, "lib", "pro", "useProCardArt.ts");
const TOP_DECKS = join(ROOT, "lib", "constants", "top-decks.ts");
const EVERGREEN_DECKS_LIB = join(ROOT, "lib", "evergreenDecks.ts");

// Shared with deck-manifest.mjs and the jest test — the rules digest is NOT
// re-derived here.
const require = createRequire(import.meta.url);
const { computeDigest } = require("./lib/deckManifest.js");

const rel = (p) => relative(ROOT, p);

// --- args ------------------------------------------------------------------

const usage = `Usage: node scripts/wire-deck.mjs <hero-id> <deckId>
       [--name "..."] [--hero "..."] [--author "..."] [--colour "#rrggbb"]
       [--tier lab|community] [--cardback <url|path>] [--engine-commit <sha>]
       [--dry-run]`;

function abort(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

const argv = process.argv.slice(2);
const KNOWN_FLAGS = new Set(["name", "hero", "author", "colour", "tier", "cardback", "engine-commit"]);
let dryRun = false;
const flagOpts = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith("--")) {
    const name = a.slice(2);
    if (name === "dry-run") {
      dryRun = true;
      continue;
    }
    if (!KNOWN_FLAGS.has(name)) abort(`unknown flag --${name}\n${usage}`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) abort(`--${name} needs a value\n${usage}`);
    flagOpts[name] = value;
    i++;
  } else {
    positional.push(a);
  }
}
const [heroId, deckId] = positional;

if (!heroId || !deckId || positional.length !== 2) {
  console.error(usage);
  process.exit(1);
}
const opts = {
  name: flagOpts.name,
  hero: flagOpts.hero,
  author: flagOpts.author,
  colour: flagOpts.colour,
  tier: flagOpts.tier ?? "lab",
  cardback: flagOpts.cardback,
  engineCommit: flagOpts["engine-commit"],
};
if (!["lab", "community"].includes(opts.tier)) {
  abort(`--tier must be "lab" or "community" (got "${opts.tier}")`);
}
// PopularDeckMeta.highlightColour is HexColorString (`#${string}`,
// lib/generic.type.ts) — a colour without the # renders broken tiles.
if (opts.colour && !/^#[0-9a-fA-F]{6}$/.test(opts.colour)) {
  abort(`--colour must be #rrggbb hex (got "${opts.colour}")`);
}
const SNAPSHOT_PATH = join(DECKS_DIR, `${deckId}.json`);

// --- helpers ---------------------------------------------------------------

const titleCase = (s) =>
  s
    .split("-")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");

async function readText(path) {
  if (!existsSync(path)) abort(`${rel(path)} not found`);
  return readFile(path, "utf8");
}

const todayIso = () => new Date().toISOString().slice(0, 10);

// DEFAULT_DECK_API is parsed out of lib/evergreenDecks.ts so this script can
// never drift from the URL the client actually uses. (It's the env-overridable
// fallback there; the comment on it pins the prod engine URL as the default.)
async function deckApiBase() {
  const src = await readText(EVERGREEN_DECKS_LIB);
  const m = src.match(/DEFAULT_DECK_API\s*=[\s\S]*?\?\?\s*"([^"]+)"/);
  if (!m)
    abort(
      `could not parse DEFAULT_DECK_API from ${rel(EVERGREEN_DECKS_LIB)} — ` +
        `expected the \`?? "<url>"\` fallback; update this script if the lib moved on`
    );
  return m[1];
}

async function fetchDeck(apiBase) {
  const res = await fetch(apiBase + deckId, { signal: AbortSignal.timeout(20000) });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} from ${apiBase}${deckId}`);
    err.status = res.status;
    throw err;
  }
  return JSON.parse(text);
}

// A minimal line diff (LCS) so --dry-run prints real git-style hunks.
// before === null means a new file: the header is /dev/null and every line is
// an addition.
function lineDiff(before, after, path, isNew = false) {
  let ops; // [tag, line]
  if (isNew) {
    ops = after.split("\n").map((l) => ["+", l]);
  } else {
    const a = before.split("\n");
    const b = after.split("\n");
    const n = a.length;
    const m = b.length;
    const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--)
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    ops = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) {
        ops.push([" ", a[i]]);
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        ops.push(["-", a[i++]]);
      } else {
        ops.push(["+", b[j++]]);
      }
    }
    while (i < n) ops.push(["-", a[i++]]);
    while (j < m) ops.push(["+", b[j++]]);
  }

  const changed = ops.map((o) => o[0] !== " ");
  if (!changed.some(Boolean)) return [];

  // Group the changes into hunks: a change run, padded with 2 context lines,
  // merged with the next run when the gap between them is ≤ 4 lines.
  const hunks = [];
  let start = -1;
  let lastChange = -1;
  for (let x = 0; x < ops.length; x++) {
    if (changed[x]) {
      if (start === -1) start = x;
      lastChange = x;
    } else if (start !== -1 && x - lastChange > 4) {
      hunks.push([start, x - 1]);
      start = -1;
    }
  }
  if (start !== -1) hunks.push([start, ops.length - 1]);

  // Line-number the ops once (aLine/bLine = source/target line of each op).
  const aLine = new Array(ops.length + 1);
  const bLine = new Array(ops.length + 1);
  {
    let ca = 1;
    let cb = 1;
    for (let x = 0; x < ops.length; x++) {
      aLine[x] = ca;
      bLine[x] = cb;
      if (ops[x][0] !== "+") ca++;
      if (ops[x][0] !== "-") cb++;
    }
    aLine[ops.length] = ca;
    bLine[ops.length] = cb;
  }

  const out = [isNew ? `--- /dev/null` : `--- a/${rel(path)}`, `+++ b/${rel(path)}`];
  for (const [hs, he] of hunks) {
    const from = Math.max(0, hs - 2);
    const to = Math.min(ops.length - 1, he + 2);
    let cA = 0;
    let cB = 0;
    for (let x = from; x <= to; x++) {
      if (ops[x][0] !== "+") cA++;
      if (ops[x][0] !== "-") cB++;
    }
    out.push(`@@ -${isNew ? 0 : aLine[from]},${isNew ? 0 : cA} +${bLine[from]},${cB} @@`);
    for (let x = from; x <= to; x++) out.push(ops[x][0] + ops[x][1]);
  }
  return out;
}

// Every planned file change; nothing is written until the plan is complete.
const plan = []; // {path, before (null = new file), after}
const track = (path, before, after) => {
  if (before !== after) plan.push({ path, before, after, isNew: before === null });
};

// Abort unless `anchor` occurs in `src`; returns its index.
function requireAnchor(src, path, anchor) {
  const at = src.indexOf(anchor);
  if (at === -1)
    abort(
      `anchor not found in ${rel(path)}:\n    ${anchor}\n  The file's shape changed — ` +
        `update scripts/wire-deck.mjs or make the edit by hand (see .claude/skills/wire-pro-deck/SKILL.md).`
    );
  return at;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Rewrite one `field: <value>` line inside a POPULAR_DECKS entry, preserving
// the line's indent and any trailing // comment. Returns null when the field
// is absent from the entry (the caller then adds it before the entry's close).
function setLine(entry, field, valueLiteral) {
  const valueRe = valueLiteral.startsWith('"') ? `"[^"]*"` : `(?:true|false)`;
  const re = new RegExp(
    `^([ \\t]*)${field}:[ \\t]*${valueRe},[ \\t]*(?:(\\/\\/[^\\n]*))?[ \\t]*$`,
    "m"
  );
  const m = entry.match(re);
  if (!m) return null;
  return entry.replace(re, `${m[1]}${field}: ${valueLiteral},${m[2] ? ` ${m[2]}` : ""}`);
}

// Remove a boolean field's line entirely (e.g. graduating a deck drops
// `lab: true` so the caution badge goes away with the tier change).
function removeBooleanLine(entry, field) {
  const re = new RegExp(`^[ \\t]*${field}:[ \\t]*(?:true|false),[^\\n]*\\n?`, "m");
  return entry.replace(re, "");
}

// Insert lines at the end of an object/array body (the text before its closing
// "\n…};" / "\n];"). Any trailing full-line comment block stays LAST (the new
// lines go above it), and the last code line gets its trailing comma if it's
// missing (a missing comma would break the insert).
function insertIntoBody(bodyPrefix, insertLines) {
  const lines = bodyPrefix.split("\n");
  let code = lines.length - 1;
  while (code >= 0 && (!lines[code].trim() || lines[code].trim().startsWith("//"))) code--;
  if (code >= 0 && !lines[code].trimEnd().endsWith(",") && !/[{[]\s*$/.test(lines[code])) {
    lines[code] = lines[code].trimEnd() + ",";
  }
  let at = code + 1;
  while (at < lines.length && !lines[at].trim()) at++;
  if (!(at < lines.length && lines[at].trim().startsWith("//"))) at = lines.length;
  lines.splice(at, 0, ...insertLines);
  return lines.join("\n");
}

// --- plan: step 1, snapshot ------------------------------------------------

const apiBase = await deckApiBase();
console.log(`Deck API (from ${rel(EVERGREEN_DECKS_LIB)}): ${apiBase}`);

let snapshotJson = null; // the deck JSON the manifest entry is based on
if (existsSync(SNAPSHOT_PATH)) {
  console.log(
    `1. Snapshot ${rel(SNAPSHOT_PATH)} — present, kept (hand-edited snapshots are never overwritten)`
  );
  snapshotJson = JSON.parse(await readFile(SNAPSHOT_PATH, "utf8"));
  try {
    const apiDeck = await fetchDeck(apiBase);
    const localDigest = computeDigest(snapshotJson);
    const apiDigest = computeDigest(apiDeck);
    const sameRules = localDigest === apiDigest;
    const sameVersion = snapshotJson.version_id === apiDeck.version_id;
    console.log(
      `   vs API: rules digest ${sameRules ? "same" : `DIFFERS (local ${localDigest.slice(7, 19)}…, api ${apiDigest.slice(7, 19)}…)`},` +
        ` version_id local=${snapshotJson.version_id ?? "?"} api=${apiDeck.version_id ?? "?"}${sameVersion ? "" : " DIFFERS"}`
    );
    if (!sameRules)
      console.log(
        `   (the hand-edited copy stays canonical; if the API change is deliberate, edit the snapshot by hand, then bump-rules)`
      );
  } catch (err) {
    console.log(`   vs API: skipped (${err.message})`);
  }
} else {
  console.log(`1. Snapshot ${rel(SNAPSHOT_PATH)} — absent, fetching ${apiBase}${deckId}`);
  try {
    snapshotJson = await fetchDeck(apiBase);
  } catch (err) {
    abort(
      `snapshot fetch failed (${err.message}). If this is an original/reskin with no ` +
        `unmatched.cards page, hand-author the snapshot per the taranis/thetis/piper/hollow-oak ` +
        `convention (see the skill), then re-run this script.`
    );
  }
  if (!snapshotJson?.deck_data?.hero)
    abort(`API payload for ${deckId} has no deck_data.hero — refusing to snapshot it`);
  const snapshotText = JSON.stringify(snapshotJson, null, 2) + "\n";
  console.log(
    `   ${dryRun ? "would write" : "queued"} ${rel(SNAPSHOT_PATH)} (${snapshotJson.deck_data.cards.length} cards, version_id ${snapshotJson.version_id})`
  );
  track(SNAPSHOT_PATH, null, snapshotText);
}

// --- plan: step 2, manifest ------------------------------------------------

let manifestEntryAdded = false; // → bump-rules re-stamp runs in the apply phase
{
  const before = await readText(MANIFEST_PATH);
  const manifest = JSON.parse(before);
  const existing = manifest.decks.find((d) => d.deckId === deckId);
  let after = before;
  if (existing) {
    if (opts.engineCommit && existing.rulesVerified && existing.rulesVerified.commit !== opts.engineCommit) {
      const oldCommit = existing.rulesVerified.commit;
      existing.rulesVerified.commit = opts.engineCommit;
      console.log(`2. Manifest entry ${deckId} — rulesVerified.commit: ${oldCommit} -> ${opts.engineCommit}`);
      after = JSON.stringify(manifest, null, 2) + "\n";
    } else {
      console.log(
        `2. Manifest entry ${deckId} — present (rules commit ${existing.rulesVerified?.commit}), untouched`
      );
    }
  } else {
    if (!snapshotJson) abort(`no snapshot JSON to base the manifest entry on`);
    const commit = opts.engineCommit ?? "TODO";
    // What bump-rules will stamp, so the printed diff shows the final entry
    // without writing anything.
    const asBumped = {
      heroId,
      deckId,
      version_id: snapshotJson.version_id ?? "TODO",
      frozenAt: todayIso(),
      digest: computeDigest(snapshotJson),
      rulesVerified: {
        repo: "unbrewed-pro-server",
        file: `data/heroes/${heroId}.rules.ts`,
        commit,
      },
    };
    console.log(
      `2. Manifest entry ${deckId} — ${dryRun ? "would add" : "adding"} stub (digest sha256:${asBumped.digest.slice(7, 19)}…, frozenAt ${asBumped.frozenAt}, commit ${commit})`
    );
    if (commit === "TODO")
      console.log(
        `   ⚠ rulesVerified.commit stamped "TODO" — re-run with --engine-commit <sha> to set it (updates the existing entry in place).`
      );
    manifest.decks.push(asBumped);
    after = JSON.stringify(manifest, null, 2) + "\n";
    manifestEntryAdded = true;
  }
  track(MANIFEST_PATH, before, after);
}

// --- plan: step 3, HERO_DECK_IDS -------------------------------------------

{
  const before = await readText(USE_PRO_CARD_ART);
  const decl = `export const HERO_DECK_IDS: Record<string, string> = {`;
  const declAt = requireAnchor(before, USE_PRO_CARD_ART, decl);
  const bodyStart = declAt + decl.length;
  const closeAt = requireAnchor(before.slice(bodyStart), USE_PRO_CARD_ART, "\n};") + bodyStart;
  const span = before.slice(bodyStart, closeAt);

  const key = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(heroId) ? heroId : JSON.stringify(heroId);
  const line = `  ${key}: ${JSON.stringify(deckId)},`;
  const entryRe = new RegExp(
    `^[ \\t]*["']?${escapeRe(heroId)}["']?:[ \\t]*["']([^"']+)["'],?[ \\t]*$`,
    "m"
  );
  let after;
  const found = span.match(entryRe);
  if (found && found[1] === deckId) {
    console.log(`3. HERO_DECK_IDS["${heroId}"] — present (${deckId}), untouched`);
    after = before;
  } else if (found) {
    console.log(`3. HERO_DECK_IDS["${heroId}"] — present but points at ${found[1]}, updating to ${deckId}`);
    after = before.slice(0, bodyStart) + span.replace(entryRe, line) + before.slice(closeAt);
  } else {
    // The map is in wiring order, newest entry last — append there. (An
    // alphabetical insert would strand an entry from its provenance comment.)
    console.log(`3. HERO_DECK_IDS — inserting ${line.trim()} at the end of the map`);
    const insertLines = [
      `  // Wired by scripts/wire-deck.mjs — TODO: one-line provenance (issue ↔ engine PR).`,
      line,
    ];
    after = insertIntoBody(before.slice(0, closeAt), insertLines) + before.slice(closeAt);
  }
  track(USE_PRO_CARD_ART, before, after);
}

// --- plan: step 4, POPULAR_DECKS -------------------------------------------

{
  const before = await readText(TOP_DECKS);
  const decl = `export const POPULAR_DECKS: PopularDeckMeta[] = [`;
  const declAt = requireAnchor(before, TOP_DECKS, decl);
  const bodyStart = declAt + decl.length;
  const closeAt = requireAnchor(before.slice(bodyStart), TOP_DECKS, "\n];") + bodyStart;
  const span = before.slice(bodyStart, closeAt);

  const idRe = new RegExp(`^[ \\t]*id:[ \\t]*"${escapeRe(deckId)}",?[ \\t]*$`, "m");
  const idMatch = span.match(idRe);
  let after;
  if (!idMatch) {
    // New stub in the CURRENT shape (Appa, #738/#740, is the exemplar):
    // name/hero default to the title-cased hero-id, colour to a neutral grey.
    const name = opts.name ?? titleCase(heroId);
    const stubLines = [
      `  {`,
      `    // TODO(${heroId}): stub written by scripts/wire-deck.mjs — replace this comment`,
      `    // with real provenance, or re-run with --name/--hero/--author/--colour/--cardback.`,
      `    id: ${JSON.stringify(deckId)},`,
      `    name: ${JSON.stringify(name)},`,
      `    hero: ${JSON.stringify(opts.hero ?? name)},`,
      opts.author ? `    author: ${JSON.stringify(opts.author)},` : `    author: "TODO — re-run with --author",`,
      `    likes: 0,`,
      `    highlightColour: ${JSON.stringify(opts.colour ?? "#666666")},`,
      ...(opts.tier === "lab" ? [`    lab: true,`] : []),
      `    tier: ${JSON.stringify(opts.tier)},`,
      ...(opts.cardback ? [`    cardbackUrl: ${JSON.stringify(opts.cardback)},`] : []),
      `  },`,
    ];
    console.log(
      `4. POPULAR_DECKS — ${dryRun ? "would insert" : "inserting"} a ${deckId} stub at the end of the roster`
    );
    after = insertIntoBody(before.slice(0, closeAt), stubLines) + before.slice(closeAt);
  } else {
    // Entry exists: update only the fields the passed flags actually touch.
    // --name touches ONLY name (19 entries deliberately carry a hero that
    // differs from name); --hero touches only hero. --tier lab keeps/sets
    // `lab: true`; --tier community removes it (a graduated deck must not
    // keep rendering the caution badge).
    const entryStart = idMatch.index;
    const closeRel = span.indexOf("\n  },", entryStart);
    if (closeRel === -1)
      abort(`could not find the closing "  }," of the ${deckId} entry in ${rel(TOP_DECKS)}`);
    const closeLineEnd = span.indexOf("\n", closeRel + 1);
    const entryEnd = closeLineEnd === -1 ? span.length : closeLineEnd + 1; // include the close line
    let entry = span.slice(entryStart, entryEnd);

    const wanted = []; // [field, valueLiteral] in the entry's canonical order
    if (opts.name) wanted.push(["name", JSON.stringify(opts.name)]);
    if (opts.hero) wanted.push(["hero", JSON.stringify(opts.hero)]);
    if (opts.author) wanted.push(["author", JSON.stringify(opts.author)]);
    if (opts.colour) wanted.push(["highlightColour", JSON.stringify(opts.colour)]);
    if (flagOpts.tier) {
      if (opts.tier === "lab") {
        wanted.push(["lab", "true"]);
        wanted.push(["tier", JSON.stringify("lab")]);
      } else {
        wanted.push(["tier", JSON.stringify("community")]);
      }
    }
    if (opts.cardback) wanted.push(["cardbackUrl", JSON.stringify(opts.cardback)]);

    let setCount = 0;
    const adds = [];
    for (const [field, valueLiteral] of wanted) {
      if (field === "lab" && opts.tier === "community") continue; // handled by remove below
      const next = setLine(entry, field, valueLiteral);
      if (next === null) adds.push([field, valueLiteral]);
      else {
        entry = next;
        setCount++;
      }
    }
    let removed = false;
    if (flagOpts.tier && opts.tier === "community") {
      const stripped = removeBooleanLine(entry, "lab");
      if (stripped !== entry) {
        entry = stripped;
        removed = true;
      }
    }
    if (adds.length) {
      const m = entry.match(/\n([ \t]*)\},\n?$/);
      if (!m)
        abort(
          `could not place fields (${adds.map(([f]) => f).join(", ")}) in the ${deckId} entry of ${rel(TOP_DECKS)} — expected it to end in "\\n  },"`
        );
      const indent = "    "; // the file's field indent
      const addText = adds.map(([f, v]) => `${indent}${f}: ${v},\n`).join("");
      const closeText = `${m[1]}},${entry.endsWith("\n") ? "\n" : ""}`;
      entry = entry.slice(0, m.index) + "\n" + addText + closeText;
    }
    const touched = setCount + adds.length + (removed ? 1 : 0);
    console.log(
      touched === 0
        ? `4. POPULAR_DECKS entry ${deckId} — present, no field flags passed, untouched`
        : `4. POPULAR_DECKS entry ${deckId} — present, ${dryRun ? "would update" : "updating"} ${touched} field(s)` +
            `${adds.length ? ` (added: ${adds.map(([f]) => f).join(", ")})` : ""}${removed ? " (removed lab)" : ""}`
    );
    after =
      before.slice(0, bodyStart) + span.slice(0, entryStart) + entry + span.slice(entryEnd) + before.slice(closeAt);
  }
  track(TOP_DECKS, before, after);
}

// --- the plan is complete: print the diff ----------------------------------

console.log(`\n${dryRun ? "Would-be" : "Applied"} diff (${plan.length} file(s)):`);
const diff = plan.flatMap((p) => lineDiff(p.before, p.after, p.path, p.isNew));
if (diff.length === 0) console.log("  (empty) — deck already wired, nothing to do");
else console.log(diff.join("\n"));

if (dryRun) {
  console.log("\nDry-run: nothing written.");
  process.exit(0);
}

// --- apply: nothing above wrote a byte; write every planned file now --------

for (const p of plan) {
  await writeFile(p.path, p.after);
}

// Reuse deck-manifest.mjs when a new stub landed — the ONLY way the lock
// moves; it computes the real digest over the rules-relevant projection and
// stamps frozenAt. The written entry already carries both (computed via the
// same shared lib, so the printed diff is the final state); this re-stamp is
// the canonical path and a no-op round-trip when they agree.
if (manifestEntryAdded) {
  const bump = spawnSync("node", [join(__dirname, "deck-manifest.mjs"), "bump-rules", deckId], {
    cwd: ROOT,
    stdio: "inherit",
  });
  if (bump.status !== 0)
    abort(
      `deck-manifest.mjs bump-rules ${deckId} failed — steps 1–4's writes are still on disk (intended). ` +
        `Fix the cause and re-run (idempotent), or git-checkout the touched files to abandon.`
    );
}

// --- step 5: verify (failures leave the writes on disk — intended) ---------

console.log("\n5. Verify:");
const run = (cmd, args) => {
  console.log(`   $ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8" });
  const out = ((r.stdout ?? "") + (r.stderr ?? "")).trim();
  console.log(out ? out.split("\n").slice(-12).map((l) => `   ${l}`).join("\n") : "   (no output)");
  if (r.status !== 0)
    abort(
      `${cmd} ${args.join(" ")} exited ${r.status} — the data writes from steps 1–4 are still on disk ` +
        `(intended). Fix the cause and re-run (idempotent), or git-checkout the touched files to abandon.`
    );
};
run("npm", ["run", "pro:decks:verify"]);
run("npx", ["jest", "lib/pro/evergreenManifest.test.ts"]);

console.log(
  `\n✓ ${heroId} (${deckId}) wired. Still by hand: art drops + snapshot appearance/token art, provenance comments, browser verification — see .claude/skills/wire-pro-deck/SKILL.md.`
);
