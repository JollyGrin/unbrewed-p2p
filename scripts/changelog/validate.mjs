#!/usr/bin/env node
/**
 * validate.mjs — validates every content/changelog/*.json entry: the same
 * shape rules the runtime loader enforces (lib/changelog/entries.ts —
 * required fields, id/date match, unique id) plus player-facing copy checks
 * that would otherwise only surface after a bad entry ships. Exits 1 on any
 * failure, printing one line per problem as "<file>: <problem>".
 *
 * Usage:
 *   node scripts/changelog/validate.mjs [options]
 *
 * Options:
 *   --dir <path>   Directory of *.json entries to check.
 *                  Default: content/changelog
 *   -h, --help     Show this help.
 *
 * Wired into `npm test` so a bad entry fails CI.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = join(__dirname, "..", "..", "content", "changelog");

const REQUIRED_FIELDS = ["id", "date", "title", "summary", "tags", "highlight"];

// Plain-substring words: distinctive enough that a false-positive match
// inside another word isn't a real risk. "PR" is handled separately below
// because it's short and would otherwise match inside ordinary words.
const BANNED_WORDS = ["jevx", "dsl", "protocol", "engine", "official deck"];
const HASH_NUMBER_RE = /#\d+/;
const PR_RE = /\bPR\b/;
// Common emoji blocks (pictographs, symbols, dingbats, flags) plus the
// variation-selector-16 that often trails an otherwise-plain glyph.
const EMOJI_RE =
  /[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}\u{2764}\u{FE0F}]/u;

function usage() {
  console.log(`Usage: node scripts/changelog/validate.mjs [options]

Validates content/changelog/*.json entries: required fields, id/date match,
unique ids, and player-facing copy checks (no issue/PR references, no
internal jargon, no emoji). Exits 1 on any failure.

Options:
  --dir <path>   Directory of *.json entries to check. Default: content/changelog
  -h, --help     Show this help.`);
}

function parseArgs(argv) {
  const opts = { dir: DEFAULT_DIR, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") opts.help = true;
    else if (arg === "--dir") opts.dir = argv[++i];
    else {
      console.error(`validate: unrecognized argument "${arg}" (see --help)`);
      process.exit(1);
    }
  }
  return opts;
}

/** Copy fields shown to players: title, summary, each body paragraph, cta label. */
function copyFields(entry) {
  const fields = [
    ["title", entry.title],
    ["summary", entry.summary],
  ];
  if (Array.isArray(entry.body)) {
    entry.body.forEach((paragraph, i) => fields.push([`body[${i}]`, paragraph]));
  }
  if (entry.cta?.label) fields.push(["cta.label", entry.cta.label]);
  return fields.filter(([, text]) => typeof text === "string");
}

function findCopyIssues(entry) {
  const issues = [];
  for (const [field, text] of copyFields(entry)) {
    const hashMatch = text.match(HASH_NUMBER_RE);
    if (hashMatch) issues.push(`${field}: contains an issue/PR reference ("${hashMatch[0]}") — "${text}"`);
    if (PR_RE.test(text)) issues.push(`${field}: contains "PR" — "${text}"`);
    for (const word of BANNED_WORDS) {
      if (text.toLowerCase().includes(word)) issues.push(`${field}: contains "${word}" — "${text}"`);
    }
    if (EMOJI_RE.test(text)) issues.push(`${field}: contains an emoji — "${text}"`);
  }
  return issues;
}

function validateEntry(entry, seenIds) {
  const problems = [];

  for (const field of REQUIRED_FIELDS) {
    if (entry[field] === undefined || entry[field] === null) {
      problems.push(`missing required field "${field}"`);
    }
  }

  if (typeof entry.id === "string" && typeof entry.date === "string") {
    if (entry.id.slice(0, entry.date.length) !== entry.date) {
      problems.push(`id "${entry.id}" does not start with its date "${entry.date}"`);
    }
    if (seenIds.has(entry.id)) {
      problems.push(`duplicate id "${entry.id}"`);
    }
    seenIds.add(entry.id);
  }

  problems.push(...findCopyIssues(entry));

  return problems;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    usage();
    return;
  }

  const files = existsOrEmpty(opts.dir)
    .filter((f) => f.endsWith(".json"))
    .sort();

  let hasError = false;
  const seenIds = new Set();

  for (const file of files) {
    const full = join(opts.dir, file);
    let entry;
    try {
      entry = JSON.parse(readFileSync(full, "utf8"));
    } catch (err) {
      console.error(`${file}: invalid JSON (${err.message})`);
      hasError = true;
      continue;
    }
    for (const problem of validateEntry(entry, seenIds)) {
      console.error(`${file}: ${problem}`);
      hasError = true;
    }
  }

  if (hasError) {
    console.error(`\nchangelog:validate failed (${files.length} entries checked)`);
    process.exit(1);
  }
  console.log(`changelog:validate passed (${files.length} entries checked)`);
}

function existsOrEmpty(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

main();
