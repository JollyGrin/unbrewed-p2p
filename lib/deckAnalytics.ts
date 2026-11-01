/**
 * Deck events (#1512, docs/analytics.md section 2). Every deck add path names
 * its `source`; the properties are ids, counts and catalog hero names only —
 * never a deck or hero name the player typed.
 */
import type { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { AnalyticsProps, track } from "@/lib/analytics";
import { LabsImportError } from "@/lib/labs/errors";

export type DeckSource =
  | "unmatched.cards"
  | "unmatched-labs"
  | "the-unmatched.club"
  | "starter"
  | "popular"
  | "code"
  | "image"
  | "bulk"
  | "deeplink"
  | "pro-hero";

/**
 * Sources whose hero name comes from a catalog (a deck site, the Pro roster).
 * The card-image builders take the name from the player's own form, so their
 * events carry no `hero_name` at all.
 */
const CATALOG_SOURCES = new Set<DeckSource>([
  "unmatched.cards",
  "unmatched-labs",
  "starter",
  "popular",
  "code",
  "deeplink",
  "pro-hero",
]);

const cardCount = (deck: DeckImportType): number =>
  (deck.deck_data?.cards ?? []).reduce((n, card) => n + (Number(card.quantity) || 0), 0);

export const deckAddedProps = (
  deck: DeckImportType,
  source: DeckSource,
  extra?: AnalyticsProps,
): AnalyticsProps => ({
  source,
  deck_id: deck.id,
  ...(CATALOG_SOURCES.has(source) ? { hero_name: deck.deck_data?.hero?.name } : {}),
  card_count: cardCount(deck),
  ...extra,
});

/**
 * A failure as a short class: an HTTP status, a Labs error code, or a parse
 * error. Never the error's message text.
 */
export const failureReason = (err: unknown): string | number => {
  if (err instanceof LabsImportError) return err.code;
  if (err instanceof SyntaxError) return "parse_error";
  const status =
    (err as { response?: { status?: unknown } } | null)?.response?.status ??
    (err as { status?: unknown } | null)?.status;
  if (typeof status === "number") return status;
  return "network";
};

export const trackDeckAddFailed = (source: DeckSource, reason: string | number): void =>
  track("deck_add_failed", { source, reason });

/**
 * The deck a game was picked with, by id. `source` is the add source the bag
 * stored on the deck, or `pro-hero` for a Pro roster deck played without
 * adding it (#1421); absent for a deck added before sources were recorded.
 */
export const trackDeckSelected = (
  mode: GameMode,
  id: string,
  bag: DeckImportType[] | undefined,
  pro: DeckImportType[] = [],
): void => {
  const inBag = bag?.find((deck) => deck.id === id);
  if (!inBag && !pro.some((deck) => deck.id === id)) return;
  const source: DeckSource | undefined = inBag ? inBag.addSource : "pro-hero";
  track("deck_selected_for_game", { mode, deck_id: id, source });
};

export type GameMode = "sandbox" | "sandbox-table" | "irl" | "pro";

/** The taxonomy's `mode` for a game route (docs/analytics.md, Taxonomy). */
export const gameModeOfPath = (pathname: string): GameMode => {
  const is = (p: string) => pathname === p || pathname.startsWith(`${p}/`);
  if (is("/irl") || is("/offline")) return "irl";
  if (is("/table")) return "sandbox-table";
  if (is("/pro")) return "pro";
  return "sandbox";
};
