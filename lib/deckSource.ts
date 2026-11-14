/**
 * Which site a deck came from and where its page lives, for sandbox telemetry
 * (`hero_seen` carries `deckSource` + `deckUrl`; the relay re-checks the pair).
 *
 * Only a deck's own recorded link counts — `sourceUrl`, stamped by the
 * importers (Labs: lib/labs/map.ts; unmatched.cards: fetchDeckById; the-unmatched.club:
 * the curated deck snapshots). A deck with none (hand-built, pasted JSON, image
 * decks, Unbrewed originals) reports neither field: a link is never inferred
 * from a name or an id.
 *
 * The host table mirrors the telemetry validator's; a URL off these hosts, not
 * https, or over 512 chars is "unknown" rather than sent and rejected.
 */
import type { DeckImportType } from "@/components/DeckPool/deck-import.type";

export type DeckSource = "unmatched-club" | "unmatched-cards" | "labs";

const DECK_HOSTS: Record<DeckSource, readonly string[]> = {
  "unmatched-club": ["the-unmatched.club", "www.the-unmatched.club"],
  "unmatched-cards": ["unmatched.cards", "www.unmatched.cards"],
  labs: ["unmatchedlabs.com", "www.unmatchedlabs.com"],
};

const MAX_DECK_URL = 512;

export const deckSourceOf = (
  deck: Pick<DeckImportType, "sourceUrl">,
): { deckSource: DeckSource; deckUrl: string } | undefined => {
  const raw = deck.sourceUrl;
  if (!raw || raw.length > MAX_DECK_URL) return undefined;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" || url.username || url.password) return undefined;
  const deckSource = (Object.keys(DECK_HOSTS) as DeckSource[]).find((s) =>
    DECK_HOSTS[s].includes(url.hostname),
  );
  return deckSource ? { deckSource, deckUrl: raw } : undefined;
};
