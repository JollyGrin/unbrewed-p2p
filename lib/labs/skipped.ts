import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { LabsSet } from "./labs.type";

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

const has = (s: string | null | undefined) => !!s && s.trim() !== "";

/**
 * Counts, per kind, of what `set` holds for `characterId` (plus what is tied
 * to no character) that the import leaves behind. Empty when nothing is.
 */
export const detectLabsSkipped = (
  set: LabsSet,
  characterId: string,
): LabsSkippedContent => {
  const mine = (owner: string | null | undefined) => !owner || owner === characterId;
  const counts = new Map<LabsSkippedKind, number>();
  const add = (kind: LabsSkippedKind, n = 1) => {
    if (n > 0) counts.set(kind, (counts.get(kind) ?? 0) + n);
  };

  for (const f of set.figures ?? []) {
    if (!mine(f.characterId)) continue;
    const kind = f.kind === "dial" || f.kind === "piece" || f.kind === "token" ? f.kind : "figure";
    // Labs keeps blank placeholder figures; only a named / pictured / modelled one is real.
    if (has(f.name) || has(f.reference?.source) || !!f.model) {
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

/** "2 health dials, 3 game pieces, 1 map" */
export const labsSkippedText = (skipped: LabsSkippedContent): string =>
  skipped
    .map(({ kind, count }) => `${count} ${NOUNS[kind][count === 1 ? 0 : 1]}`)
    .join(", ");

/** "Lucy, 15 cards, hero card, deck back" — what the built deck holds. */
export const labsImportedText = (deck: DeckImportType): string => {
  const cards = deck.deck_data?.cards ?? [];
  const played = cards
    .filter((c) => !c.isCharacterCard)
    .reduce((n, c) => n + (c.quantity ?? 1), 0);
  const heroCard = cards.some((c) => c.isCharacterCard && c.title === deck.name);
  const rules = cards.filter((c) => c.isCharacterCard && c.title !== deck.name).length;
  return [
    deck.name,
    `${played} ${played === 1 ? "card" : "cards"}`,
    heroCard && "hero card",
    rules > 0 && `${rules} rule ${rules === 1 ? "card" : "cards"}`,
    deck.deck_data?.appearance?.cardbackUrl && "deck back",
  ]
    .filter(Boolean)
    .join(", ");
};
