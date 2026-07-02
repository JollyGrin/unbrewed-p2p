import { FC, memo, useEffect, useState } from "react";
import { Box, Flex } from "@chakra-ui/react";
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

/** preload the url once so sprite cells (css backgrounds) can also detect failure */
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

const ImageFace = ({
  image,
  title,
}: {
  image: CardImageRef;
  title: string;
}) => {
  const isSheet = !!image.cols && !!image.rows;
  if (!isSheet) {
    return (
      <Flex h="100%" w="100%" alignItems="center" justifyContent="center">
        <img
          src={image.url}
          alt={title}
          draggable={false}
          style={{
            height: "100%",
            maxWidth: "100%",
            objectFit: "contain",
            userSelect: "none",
            borderRadius: "4.5% / 3.2%",
          }}
        />
      </Flex>
    );
  }

  const cols = image.cols as number;
  const rows = image.rows as number;
  const index = image.index ?? 0;
  const col = index % cols;
  const row = Math.floor(index / cols);
  // percentage background positioning: 0..100% across (cells - 1) steps
  const posX = cols > 1 ? (col / (cols - 1)) * 100 : 0;
  const posY = rows > 1 ? (row / (rows - 1)) * 100 : 0;

  return (
    <Flex h="100%" w="100%" alignItems="center" justifyContent="center">
      <Box
        role="img"
        aria-label={title}
        h="100%"
        maxW="100%"
        style={{ aspectRatio: "63 / 88" }}
        borderRadius="4.5% / 3.2%"
        backgroundImage={`url(${image.url})`}
        backgroundSize={`${cols * 100}% ${rows * 100}%`}
        backgroundPosition={`${posX}% ${posY}%`}
        userSelect="none"
      />
    </Flex>
  );
};
