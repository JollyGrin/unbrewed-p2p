/**
 * What one deck puts on a table.place table, in words a player reads before
 * creating it (issue #1008). Pure: the /table page renders it, the tests pin it.
 */
import type { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { deckToPlayerPack } from "./deckToPack";
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
  /** The converter's list, in plain words. */
  skipped: string[];
  /** Quiet, informational: cards left off the table because they have no face. */
  notes: string[];
};

const NO_FACE = /: no finished face$/;
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
  const { pack, pieces } = deckToPlayerPack(deck, { faces: () => "about:" });
  const slot = (name: string) =>
    pack?.decks?.find((d) => d.slot === name)?.cards.length ?? 0;
  const sidekickCount = pieces.filter(
    (p) => p.role === "fighter" && p.fighter === "sidekick",
  ).length;
  const refused = skipped.some((s) => NO_FACE.test(s)) ? NO_TABLE_IMAGES : null;

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
    referenceCards: slot("rules") + slot("extras"),
    dials: pieces
      .filter((p) => p.role === "hp")
      .map((p) => ({
        name: p.piece.name.replace(/ HP$/, ""),
        value: p.value ?? 0,
      })),
    tokens: pieces.filter((p) => p.role === "token").map((p) => p.piece.name),
    refused,
    // one line says it all; a card-by-card list is noise
    skipped: refused ? [] : skipped.map(plainSkipped),
    notes: refused ? [] : notes,
  };
};
