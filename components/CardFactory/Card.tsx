import { FC, memo, useEffect, useId, useState } from "react";
import { cardAppearance } from "@/lib/pro/cardAppearance";
import type { CosmeticRimTier } from "@/lib/pro/cosmetics";
import {
  CardImageRef,
  DeckImportCardType,
} from "../DeckPool/deck-import.type";
import { CardFactory } from "./card.factory";
import { CardRim } from "./cardRim";

/**
 * The one card renderer the app should use. Cards whose APPEARANCE carries a
 * face image render that image (single file or a sprite-sheet cell, as exported
 * by Tabletop Simulator / The Unmatched Club); everything else renders the
 * classic generated template — here the DOM-hybrid one, which paints an HTML
 * art layer behind a frame-only SVG (issue #373). If the image fails to load we
 * fall back to the template so a dead link never blanks the table.
 *
 * The face image is asked of the cosmetics seam (`cardAppearance`, design doc
 * §7 Phase 0) rather than read off the card, so both branches — and therefore
 * both DOM render combinations — resolve through the one indirection point a
 * later cosmetic layer plugs into.
 */
const CardBase: FC<{ card: DeckImportCardType }> = ({ card }) => {
  const { cardImage: image, rimTier } = cardAppearance(card);
  const failed = useImageFailed(image?.url);
  // The generated branch reads the treatment off the card through the same
  // seam, one layer down in CardSvg — so a fallback from a dead image url
  // keeps the rim, exactly like it keeps the card.
  if (!image?.url || failed) return <CardFactory card={card} />;
  return <ImageFace image={image} title={card.title} rimTier={rimTier} />;
};

export const Card = memo(CardBase);

/** preload the url once so sprite cells can also detect failure */
const useImageFailed = (url?: string) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    const img = new Image();
    img.onerror = () => alive && setFailed(true);
    img.src = url;
    return () => {
      alive = false;
    };
  }, [url]);
  return failed;
};

/**
 * Rendered as an SVG with the template's 63x88 viewBox so image cards
 * get the exact same sizing behavior as generated cards in every
 * container (fixed-height hand fan, auto-height modal grids, etc.).
 */
export const ImageFace = ({
  image,
  title,
  width = "100%",
  height = "100%",
  clipId: clipIdProp,
  rimTier,
}: {
  image: CardImageRef;
  title: string;
  /** Explicit sizing + clip id for string-rendered board tokens, where
   * percentages resolve against the board svg and useId can't be unique. */
  width?: string | number;
  height?: string | number;
  clipId?: string;
  /** Equipped cosmetic rim (epic #610), passed in rather than read off a card
   * because this component draws bare images too — hero sprite-sheet cells and,
   * crucially, CARD BACKS. A back is rendered without a tier by construction,
   * which is what keeps a cosmetic from leaking through a face-down card. */
  rimTier?: CosmeticRimTier | null;
}) => {
  const autoId = useId();
  const clipId = clipIdProp ?? autoId;
  const isSheet = !!image.cols && !!image.rows;
  const cols = image.cols ?? 1;
  const rows = image.rows ?? 1;
  const index = image.index ?? 0;
  const col = index % cols;
  const row = Math.floor(index / cols);

  return (
    <svg
      viewBox="0 0 63 88"
      preserveAspectRatio="xMidYMid meet"
      height={height}
      width={width}
      style={{ userSelect: "none" }}
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <clipPath id={clipId}>
        <rect width={63} height={88} rx={2.5} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        {isSheet ? (
          // draw the whole sheet scaled so each cell is 63x88, shifted
          // to put the wanted cell in the viewBox
          <image
            href={image.url}
            x={-col * 63}
            y={-row * 88}
            width={63 * cols}
            height={88 * rows}
            preserveAspectRatio="none"
          />
        ) : (
          <image
            href={image.url}
            width={63}
            height={88}
            preserveAspectRatio="xMidYMid meet"
          />
        )}
      </g>
      {/* Last child: paints over the (clipped) face, inside the same viewBox. */}
      <CardRim tier={rimTier} />
    </svg>
  );
};
