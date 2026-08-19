/**
 * The card-cosmetics seam (design doc §7, Phase 0).
 *
 * ONE place decides what a single card LOOKS like: the frozen snapshot's
 * per-card `cardImage` (or nothing, in which case the card renders through the
 * generated template), plus whatever cosmetic treatment the player has equipped
 * on that card — today the metal-rim ladder of epic #610.
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
import type { CosmeticRimTier } from "./cosmetics";

/**
 * Title key used by the frozen art snapshot AND the cosmetics registry — the
 * two must normalize identically or a rim silently misses its card. Lives here,
 * in the dependency-free module, so both sides can share it without either
 * importing the /pro data hook.
 */
export const norm = (s: string) => s.trim().toLowerCase();

/**
 * How one card is drawn. Treatment fields sit BESIDE `cardImage`, never in
 * place of it, so every renderer already asking the seam picks them up for
 * free.
 */
export interface CardAppearance {
  /** Full-bleed face art (single file or sprite-sheet cell), or null when the
   * card has none and renders through the generated template instead. */
  cardImage: CardImageRef | null;
  /** Equipped metal rim, or null for base art — the SAME four-tier ladder the
   * fighter token wears (`COSMETIC_RIM_PAINTS`, #613). Drawn as a translucent
   * overlay just INSIDE the card boundary (design doc §6) — never a frame
   * recolor — so it reads identically on a flat image bitmap and a generated
   * SVG frame. */
  rimTier: CosmeticRimTier | null;
}

/**
 * Appearance of a card the caller already holds. `cardImage` is, by
 * construction, the `card.cardImage` read every renderer used to do inline; the
 * treatment rides on the card too, stamped there by `withRimTier` at the one
 * point that knows the card's `(heroId, title)` key.
 */
export const cardAppearance = (
  card?: DeckImportCardType | null,
): CardAppearance => ({
  cardImage: card?.cardImage ?? null,
  rimTier: card?.cosmeticRimTier ?? null,
});

/**
 * Stamp a resolved card with its treatment — the bridge from the keyed
 * `(heroId, title)` registry to renderers that hold only a card.
 *
 * Identity matters more than it looks: `Card`, `CardFactory` and the board
 * token cache all key on the card object, so naively spreading a copy per call
 * would re-render (and re-layout) every upgraded card on every parent render.
 * The stamped copy is therefore memoized per (base card, tier) and handed back
 * by reference, and an unchanged tier returns the base card untouched.
 */
const stamped = new WeakMap<
  DeckImportCardType,
  Map<CosmeticRimTier | undefined, DeckImportCardType>
>();

export function withRimTier<T extends DeckImportCardType | null | undefined>(
  card: T,
  tier: CosmeticRimTier | null,
): T {
  if (!card) return card;
  const next = tier ?? undefined;
  if ((card.cosmeticRimTier ?? undefined) === next) return card;
  let byTier = stamped.get(card);
  if (!byTier) stamped.set(card, (byTier = new Map()));
  const hit = byTier.get(next);
  if (hit) return hit as T;
  const copy = { ...card, cosmeticRimTier: next };
  byTier.set(next, copy);
  return copy as T;
}
