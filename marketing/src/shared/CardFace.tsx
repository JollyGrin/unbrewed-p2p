import { Card } from "../../../components/CardFactory/Card";
import { withRimTier } from "../../../lib/pro/cardAppearance";
import type { CosmeticRimTier } from "../../../lib/pro/cosmetics";
import type { DeckImportCardType } from "../../../components/DeckPool/deck-import.type";
import { alpha } from "./color";
import type { PromoCard } from "./deck";

/**
 * Adapter around the app's real card renderer: the promo shows the exact face
 * players see at the table, not a marketing mock-up. `PromoCard` is the deck
 * JSON's card shape with its art already pointed at a local file, so the only
 * gap to `DeckImportCardType` is the card-type string union.
 *
 * `rimTier` goes through `withRimTier` — the same seam /pro and /collection
 * paint through — so the cosmetics ad wears the shipped `CardRim`, not a
 * gradient re-drawn for the video.
 */
export const CardFace: React.FC<{
  card: PromoCard;
  height: number;
  rimTier?: CosmeticRimTier | null;
}> = ({ card, height, rimTier }) => (
  <div
    style={{
      width: (height * 63) / 88,
      height,
      filter: `drop-shadow(0 24px 34px ${alpha("#000000", 0.45)})`,
    }}
  >
    <Card
      card={withRimTier(card as unknown as DeckImportCardType, rimTier ?? null)}
    />
  </div>
);
