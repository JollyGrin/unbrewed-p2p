import { FC, memo, useEffect, useId, useState } from "react";
import {
  CardImageRef,
  DeckImportCardType,
} from "../DeckPool/deck-import.type";
import { CardFactory } from "./card.factory";

/**
 * The one card renderer the app should use. Cards carrying a
 * `cardImage` render that image (single file or a sprite-sheet cell,
 * as exported by Tabletop Simulator / The Unmatched Club); everything
 * else renders the classic generated template. If the image fails to
 * load we fall back to the template so a dead link never blanks the
 * table.
 */
const CardBase: FC<{ card: DeckImportCardType }> = ({ card }) => {
  const image = card?.cardImage;
  const failed = useImageFailed(image?.url);
  if (!image?.url || failed) return <CardFactory card={card} />;
  return <ImageFace image={image} title={card.title} />;
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
}: {
  image: CardImageRef;
  title: string;
}) => {
  const clipId = useId();
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
      height="100%"
      width="100%"
      style={{ userSelect: "none" }}
      role="img"
      aria-label={title}
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
    </svg>
  );
};
