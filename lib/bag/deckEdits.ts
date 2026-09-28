/**
 * What re-adding a deck would throw away (#1033).
 *
 * A re-add replaces the saved copy by id (#1002, and always so in the
 * account), so `pushDeck` asks first — but only when the player has changes to
 * lose. A re-import that differs only in source data (dates, revision, likes,
 * re-rendered image urls, key order) goes through quietly.
 *
 * Compared always, because no source sets them on the player's behalf:
 * - saved tokens (after pointing hero-card / Labs component tokens at the new
 *   renders, exactly as a deep-link refresh does) and the token colour
 * - which cards are flagged hero / rule cards, by title, for titles in both
 *
 * Compared only when the source itself is unchanged (same revision, same card
 * faces), because they live in `deck_data` next to what the source ships: hero
 * and sidekick stats, and the card back. When the source has moved on these
 * are the source's, the same call a deep-link refresh makes (lib/deckRefresh).
 */
import {
  DeckImportCardType,
  DeckImportType,
} from "@/components/DeckPool/deck-import.type";
import { refreshSavedTokens } from "@/lib/deckRefresh";

export type DeckEdit =
  | "saved tokens"
  | "token colour"
  | "hero and rule cards"
  | "hero stats"
  | "sidekick stats"
  | "card back";

/** JSON with sorted keys, so key order never reads as a change. */
const stable = (value: unknown): string =>
  JSON.stringify(value, (_, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );

const cardsOf = (deck: DeckImportType): DeckImportCardType[] =>
  deck.deck_data?.cards ?? [];

const faces = (deck: DeckImportType) =>
  cardsOf(deck).map((c) => `${c.title}|${c.cardImage?.url ?? c.imageUrl ?? ""}`);

const sourceUnchanged = (saved: DeckImportType, incoming: DeckImportType) =>
  saved.version_id === incoming.version_id &&
  stable(faces(saved)) === stable(faces(incoming));

const flagged = (deck: DeckImportType) => {
  const byTitle = new Map<string, boolean>();
  for (const card of cardsOf(deck)) {
    byTitle.set(card.title, (byTitle.get(card.title) ?? false) || !!card.isCharacterCard);
  }
  return byTitle;
};

const heroStats = (deck: DeckImportType) => {
  const hero = deck.deck_data?.hero;
  return [hero?.name, hero?.hp, hero?.move, hero?.isRanged, hero?.specialAbility];
};

const sidekickStats = (deck: DeckImportType) => {
  const side = deck.deck_data?.sidekick;
  return [side?.name, side?.hp, side?.quantity, side?.isRanged, side?.quote];
};

const cardBacks = (deck: DeckImportType) => [
  deck.deck_data?.appearance?.cardbackUrl ?? "",
  ...cardsOf(deck).map((c) => c.cardBackUrl ?? ""),
];

/** The player's changes on `saved` that replacing it with `incoming` would lose. */
export const deckEditsLost = (
  saved: DeckImportType,
  incoming: DeckImportType,
): DeckEdit[] => {
  const lost: DeckEdit[] = [];

  // No loadout on the saved copy: nothing of the player's to lose, whatever
  // the incoming copy seeds. An empty one may be seeded tokens they removed.
  if (saved.savedTokens) {
    const kept = refreshSavedTokens(saved.savedTokens, { from: saved, to: incoming });
    if (stable(kept) !== stable(incoming.savedTokens ?? [])) lost.push("saved tokens");
  }

  if (
    saved.savedTokenColor !== undefined &&
    saved.savedTokenColor !== incoming.savedTokenColor
  ) {
    lost.push("token colour");
  }

  const incomingFlags = flagged(incoming);
  const savedFlags = flagged(saved);
  for (const [title, isFlagged] of savedFlags) {
    if (incomingFlags.has(title) && incomingFlags.get(title) !== isFlagged) {
      lost.push("hero and rule cards");
      break;
    }
  }

  if (sourceUnchanged(saved, incoming)) {
    if (stable(heroStats(saved)) !== stable(heroStats(incoming))) lost.push("hero stats");
    if (stable(sidekickStats(saved)) !== stable(sidekickStats(incoming))) {
      lost.push("sidekick stats");
    }
    if (stable(cardBacks(saved)) !== stable(cardBacks(incoming))) lost.push("card back");
  }

  return lost;
};
