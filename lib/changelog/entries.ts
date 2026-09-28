/**
 * Loads and validates the changelog entries generated from
 * `content/changelog/*.json` (see `lib/buildTools/generateChangelogIndex.js`).
 */
import { rawChangelogEntries } from "./generatedEntries";
import type { ChangelogEntry } from "./types";

const REQUIRED_FIELDS = ["id", "date", "title", "summary", "tags", "highlight"] as const;

function assertHasRequiredFields(entry: ChangelogEntry): void {
  for (const field of REQUIRED_FIELDS) {
    if (entry[field] === undefined || entry[field] === null) {
      throw new Error(
        `Changelog entry "${entry.id ?? "<unknown>"}" is missing required field "${field}".`,
      );
    }
  }
}

function assertDatePrefixMatches(entry: ChangelogEntry): void {
  if (entry.id.slice(0, entry.date.length) !== entry.date) {
    throw new Error(
      `Changelog entry "${entry.id}" has an id whose date prefix doesn't match its date field ("${entry.date}").`,
    );
  }
}

/**
 * Pure validate + sort (newest first, by id — sorts identically to date
 * since ids are prefixed "<yyyy-mm-dd>-"). Exported so tests can feed it
 * fabricated entries without touching the real seed content.
 */
export function buildChangelogEntries(raw: ChangelogEntry[]): ChangelogEntry[] {
  const seenIds = new Set<string>();
  for (const entry of raw) {
    assertHasRequiredFields(entry);
    assertDatePrefixMatches(entry);
    if (seenIds.has(entry.id)) {
      throw new Error(`Duplicate changelog entry id "${entry.id}".`);
    }
    seenIds.add(entry.id);
  }
  return [...raw].sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}

let cachedEntries: ChangelogEntry[] | null = null;

/** All changelog entries, newest first. Validated once and cached. */
export function getChangelogEntries(): ChangelogEntry[] {
  if (!cachedEntries) {
    cachedEntries = buildChangelogEntries(rawChangelogEntries);
  }
  return cachedEntries;
}

/** Test-only: drop the memoized entries so the next call re-validates. */
export const __resetChangelogEntriesForTest = () => {
  cachedEntries = null;
};
