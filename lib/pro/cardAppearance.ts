/**
 * The card-cosmetics seam (design doc §7, Phase 0).
 *
 * ONE place decides what a single card LOOKS like. Today that decision is
 * exactly what it has always been — the frozen snapshot's per-card `cardImage`,
 * or nothing, in which case the card renders through the generated template —
 * so this module is pure indirection with zero behaviour of its own.
 *
 * It exists so the cosmetic layer has a single point to plug into. Every card
 * renderer asks the seam instead of reading `card.cardImage` itself, which
 * covers all four render combinations (generated/image x DOM-hybrid/board
 * token) from one function:
 *
 *   - image + DOM-hybrid     components/CardFactory/Card.tsx -> ImageFace
 *   - generated + DOM-hybrid components/CardFactory/Card.tsx -> CardFactory
 *   - image + board token    components/BoardCanvas/Tokens/cardFace.tsx -> ImageFace
 *   - generated + board token components/BoardCanvas/Tokens/cardFace.tsx -> CardSvg
 *
 * Deliberately dependency-free (no react-query, no axios): the renderers it
 * feeds are the SANDBOX card components too, and they have no business pulling
 * a /pro data hook into their bundle. The per-card `(heroId, title)` entry
 * point lives with the snapshot data that answers it, in `useProCardArt.ts`.
 *
 * ⛔ THE INVARIANT — a cosmetic changes what a card LOOKS like and nothing
 * else. Nothing resolved here may ever reach the engine, a log line, a replay
 * outcome, or a card's identity.
 */
import type {
  CardImageRef,
  DeckImportCardType,
} from "@/components/DeckPool/deck-import.type";

/**
 * How one card is drawn. Phase 0 carries the snapshot's face art and NOTHING
 * else — a later phase adds treatment fields BESIDE `cardImage`, never in place
 * of it, so every renderer already asking the seam picks them up for free.
 */
export interface CardAppearance {
  /** Full-bleed face art (single file or sprite-sheet cell), or null when the
   * card has none and renders through the generated template instead. */
  cardImage: CardImageRef | null;
}

/**
 * Appearance of a card the caller already holds. Identical, by construction, to
 * the `card.cardImage` read every renderer used to do inline.
 */
export const cardAppearance = (
  card?: DeckImportCardType | null,
): CardAppearance => ({ cardImage: card?.cardImage ?? null });
