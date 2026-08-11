import { Card } from "../../../components/CardFactory/Card";
import type { DeckImportCardType } from "../../../components/DeckPool/deck-import.type";
import type { PromoCard } from "./deck";
import { alpha } from "./palette";

/**
 * Adapter around the app's real card renderer: the promo shows the exact face
 * players see at the table, not a marketing mock-up. `PromoCard` is the deck
 * JSON's card shape with its art already pointed at a local file, so the only
 * gap to `DeckImportCardType` is the card-type string union.
 */
export const CardFace: React.FC<{ card: PromoCard; height: number }> = ({
  card,
  height,
}) => (
  <div
    style={{
      width: (height * 63) / 88,
      height,
      filter: `drop-shadow(0 24px 34px ${alpha("#000000", 0.45)})`,
    }}
  >
    <Card card={card as unknown as DeckImportCardType} />
  </div>
);
