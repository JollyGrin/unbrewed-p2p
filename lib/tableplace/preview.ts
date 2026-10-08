/**
 * What one deck puts on a table.place table, in words a player reads before
 * creating it (issue #1008). Pure: the /table page renders it, the tests pin it.
 */
import type { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { deckToPlayerPack } from "./deckToPack";
import { isRuleSlot } from "./layout";
import type { FaceResolver, Skipped } from "./types";

export type DeckPreview = {
  deckName: string;
  hero: { name: string; hp: number } | null;
  sidekick: { name: string; count: number; hp: number } | null;
  /** Action cards in the draw deck, one per copy. */
  cards: number;
  /** Face-up reference cards (rules, extra characters). */
  referenceCards: number;
  /** One HP dial per fighter, with its starting value. */
  dials: { name: string; value: number }[];
  tokens: string[];
  /** Why the deck can't go on the table; null when it can. */
  refused: string | null;
  /** Cards with no finished face, one per card (not per copy). */
  missingFaces: number;
  /** Distinct finished faces the deck's own cards carry (Labs renders, TTS sheets). */
  finishedFaces: number;
  /** The converter's list, in plain words. */
  skipped: string[];
  /** Quiet, informational: cards left off the table because they have no face. */
  notes: string[];
};

const NO_FACE = /: no finished face$/;
/** What the second conversion answers for every face a deck lacks. */
const STAND_IN = "about:";
export const NO_TABLE_IMAGES =
  "This deck's cards don't have table images yet. Bring it in as a Tabletop Simulator export.";

/** "Branch Out: no finished face" → "“Branch Out” has no card image yet". */
export const plainSkipped = (s: Skipped): string => {
  const seat = /^Seat (\d): (.*)$/.exec(s);
  const rest = seat ? seat[2] : s;
  const who = seat ? (seat[1] === "0" ? "Your deck: " : "Their deck: ") : "";
  if (NO_FACE.test(rest)) {
    return `${who}“${rest.replace(NO_FACE, "")}” has no finished card image`;
  }
  const left = /^(token )?"?(.*?)"? left off \((.*)\)$/.exec(rest);
  if (left) {
    const [, , name, why] = left;
    return `${who}“${name}” stays off the table (${why})`;
  }
  return `${who}${rest}`;
};

/**
 * `faces` answers the decks that have no finished faces of their own; a card's
 * own image (a Labs render, a TTS sheet) always wins inside the converter.
 */
export const previewDeck = (
  deck: DeckImportType,
  faces: FaceResolver = () => null,
): DeckPreview => {
  const data = deck.deck_data;
  const { skipped, notes } = deckToPlayerPack(deck, { faces });
  // The shape of the table doesn't depend on the faces: a stand-in face shows
  // what a refused deck WOULD put down, so its preview isn't empty.
  const { pack, pieces } = deckToPlayerPack(deck, { faces: () => STAND_IN });
  const slot = (name: string) =>
    pack?.decks?.find((d) => d.slot === name)?.cards.length ?? 0;
  const ruleCards = (pack?.decks ?? []).filter((d) => isRuleSlot(d.slot));
  const sidekickCount = pieces.filter(
    (p) => p.role === "fighter" && p.fighter === "sidekick",
  ).length;
  const missingFaces = skipped.filter((s) => NO_FACE.test(s)).length;
  const refused = missingFaces ? NO_TABLE_IMAGES : null;
  const ownFaces = new Set(
    (pack?.decks ?? []).flatMap((d) => d.cards.map((c) => c.face)),
  );
  ownFaces.delete(STAND_IN);

  return {
    deckName: data.name || deck.name,
    hero: data.hero?.name ? { name: data.hero.name, hp: data.hero.hp } : null,
    sidekick: sidekickCount
      ? {
          name: data.sidekick.name,
          count: sidekickCount,
          hp: data.sidekick.hp ?? 1,
        }
      : null,
    cards: slot("deck"),
    referenceCards:
      ruleCards.reduce((n, d) => n + d.cards.length, 0) + slot("extras"),
    dials: pieces
      .filter((p) => p.role === "hp")
      .map((p) => ({
        name: p.piece.name.replace(/ HP$/, ""),
        value: p.value ?? 0,
      })),
    tokens: pieces.filter((p) => p.role === "token").map((p) => p.piece.name),
    refused,
    missingFaces,
    finishedFaces: ownFaces.size,
    // one line says it all; a card-by-card list is noise
    skipped: refused ? [] : skipped.map(plainSkipped),
    notes: refused ? [] : notes,
  };
};

const previews = new WeakMap<DeckImportType, DeckPreview>();

/**
 * `previewDeck` with no resolver, kept per deck object: a preview converts the
 * deck twice, and the /table galleries ask for the whole bag's on every render.
 * The bag hands back the same deck objects until it changes.
 */
export const previewOf = (deck: DeckImportType): DeckPreview => {
  const kept = previews.get(deck);
  if (kept) return kept;
  const preview = previewDeck(deck);
  previews.set(deck, preview);
  return preview;
};

/** A refused deck's tile chip: how far it is from going on a table. */
export const refusedChip = (
  p: Pick<DeckPreview, "missingFaces" | "finishedFaces">,
): string =>
  p.finishedFaces === 0
    ? "No table images"
    : `${p.missingFaces} ${p.missingFaces === 1 ? "card has" : "cards have"} no image`;

const sidekickLine = (p: DeckPreview, withHp: boolean): string => {
  if (!p.sidekick) return "";
  const many = withHp && p.sidekick.count > 1 ? `${p.sidekick.count} × ` : "";
  return `${many}${p.sidekick.name}${withHp ? ` ${p.sidekick.hp} HP` : ""}`;
};

const dotted = (...parts: string[]) => parts.filter(Boolean).join(" · ");

/** A gallery tile's line: "15 HP · Yoda". */
export const deckMetaLine = (p: DeckPreview): string =>
  dotted(p.hero ? `${p.hero.hp} HP` : "", sidekickLine(p, false));

/** A seat's two lines: "15 HP · 3 × Yoda 6 HP", then "30 cards · 2 HP dials". */
export const seatLines = (p: DeckPreview): [string, string] => [
  dotted(p.hero ? `${p.hero.hp} HP` : "", sidekickLine(p, true)),
  dotted(
    `${p.cards} ${p.cards === 1 ? "card" : "cards"}`,
    `${p.dials.length} HP ${p.dials.length === 1 ? "dial" : "dials"}`,
  ),
];
