import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { LabsSet } from "./labs.type";
import { isCountableFigure } from "./components";

/**
 * What a Labs set holds that the import doesn't bring in (#1000). Kept apart
 * from `detectLabsUnsupported`: that list is about cards we'd draw wrongly and
 * can hold a deep link; this one is information only and never blocks.
 */
export type LabsSkippedKind =
  | "dial"
  | "piece"
  | "token"
  | "figure"
  | "map"
  | "initiative"
  | "event"
  | "special"
  | "threat";

export type LabsSkippedContent = { kind: LabsSkippedKind; count: number }[];

const NOUNS: Record<LabsSkippedKind, [string, string]> = {
  dial: ["health dial", "health dials"],
  piece: ["game piece", "game pieces"],
  token: ["character token", "character tokens"],
  figure: ["figure", "figures"],
  map: ["map", "maps"],
  initiative: ["initiative card", "initiative cards"],
  event: ["event card", "event cards"],
  special: ["special card", "special cards"],
  threat: ["threat track", "threat tracks"],
};

/**
 * Counts, per kind, of what `set` holds for `characterId` (plus what is tied
 * to no character) that the import leaves behind. Empty when nothing is.
 */
export const detectLabsSkipped = (
  set: LabsSet,
  characterId: string,
  /** figures the import brought in as tokens (#1001) */
  imported: ReadonlySet<string> = new Set(),
): LabsSkippedContent => {
  const mine = (owner: string | null | undefined) => !owner || owner === characterId;
  const counts = new Map<LabsSkippedKind, number>();
  const add = (kind: LabsSkippedKind, n = 1) => {
    if (n > 0) counts.set(kind, (counts.get(kind) ?? 0) + n);
  };

  for (const f of set.figures ?? []) {
    if (!mine(f.characterId) || imported.has(f.id)) continue;
    const kind = f.kind === "dial" || f.kind === "piece" || f.kind === "token" ? f.kind : "figure";
    if (isCountableFigure(f)) {
      add(kind);
    }
  }

  const maps = [set.map, ...(set.maps ?? [])];
  for (const m of maps) add("map", (m?.spaces ?? []).length > 0 ? 1 : 0);

  const deckKinds: Partial<Record<string, LabsSkippedKind>> = {
    initiative: "initiative",
    event: "event",
    special: "special",
  };
  for (const d of set.decks ?? []) {
    const kind = deckKinds[d.kind];
    if (!kind || !mine(d.ownerId)) continue;
    add(kind, (set.cards ?? []).filter((c) => c.deckId === d.id).length);
  }

  if (set.threat?.enabled) add("threat");

  return (Object.keys(NOUNS) as LabsSkippedKind[])
    .filter((kind) => counts.has(kind))
    .map((kind) => ({ kind, count: counts.get(kind)! }));
};

/** The summary once the player ticks "also add this set's map" (#1002): the map is no longer left behind. */
export const withoutSkippedMap = (skipped: LabsSkippedContent): LabsSkippedContent =>
  skipped.filter(({ kind }) => kind !== "map");

/** "2 health dials, 3 game pieces, 1 map" */
export const labsSkippedText = (skipped: LabsSkippedContent): string =>
  skipped
    .map(({ kind, count }) => `${count} ${NOUNS[kind][count === 1 ? 0 : 1]}`)
    .join(", ");

/** "2 health dials", "3 game pieces" — the Labs components the deck brought in (#1001). */
const componentsText = (deck: DeckImportType): string[] => {
  const counts = new Map<LabsSkippedKind, number>();
  for (const { kind } of deck.labsComponents ?? []) {
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return (Object.keys(NOUNS) as LabsSkippedKind[])
    .filter((kind) => counts.has(kind))
    .map((kind) => {
      const count = counts.get(kind)!;
      return `${count} ${NOUNS[kind][count === 1 ? 0 : 1]}`;
    });
};

/** "Lucy, 30 cards, hero card, 1 extra character card, deck back, 2 health dials" — what the built deck holds. */
export const labsImportedText = (
  deck: DeckImportType,
  /** the set's map was ticked and will be added to the bag's maps (#1002) */
  withMap = false,
): string => {
  const cards = deck.deck_data?.cards ?? [];
  const played = cards
    .filter((c) => !c.isCharacterCard)
    .reduce((n, c) => n + (c.quantity ?? 1), 0);
  // Reference cards are the hero card, the extra character cards (#999: a
  // second fighter such as Piper, titled with its name) and the rule cards.
  const extraNames = new Set(
    (deck.deck_data?.extraCharacters ?? []).map((c) => c.hero.name),
  );
  const reference = cards.filter((c) => c.isCharacterCard);
  const heroCard = reference.some((c) => c.title === deck.name);
  const extras = reference.filter((c) => c.title !== deck.name && extraNames.has(c.title)).length;
  const rules = reference.filter((c) => c.title !== deck.name && !extraNames.has(c.title)).length;
  return [
    deck.name,
    `${played} ${played === 1 ? "card" : "cards"}`,
    heroCard && "hero card",
    extras > 0 && `${extras} extra character ${extras === 1 ? "card" : "cards"}`,
    rules > 0 && `${rules} rule ${rules === 1 ? "card" : "cards"}`,
    deck.deck_data?.appearance?.cardbackUrl && "deck back",
    ...componentsText(deck),
    withMap && "1 map",
  ]
    .filter(Boolean)
    .join(", ");
};
