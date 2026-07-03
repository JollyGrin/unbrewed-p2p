import {
  Box,
  Button,
  Flex,
  IconButton,
  Slider,
  SliderFilledTrack,
  SliderThumb,
  SliderTrack,
  Text,
} from "@chakra-ui/react";
import { CloseIcon, RepeatIcon } from "@chakra-ui/icons";
import { FC } from "react";
import {
  BoardToken,
  DEFAULT_CARD_TOKEN_WIDTH,
  cardTokenHeight,
} from "./position.type";

/**
 * Floating controls for a selected card token. Only ever opens for the
 * owner's own cards (selection is owner-gated on the canvas). A card token
 * has no plain delete — the card must go somewhere, so every exit returns
 * it to a pool zone.
 */
export const CardTokenPanel: FC<{
  token: BoardToken;
  onFlip: () => void;
  onToHand: () => void;
  onToDiscard: () => void;
  onToDeckTop: () => void;
  onToDeckBottom: () => void;
  onResize: (size: number, h: number) => void;
  onClose: () => void;
}> = ({
  token,
  onFlip,
  onToHand,
  onToDiscard,
  onToDeckTop,
  onToDeckBottom,
  onResize,
  onClose,
}) => {
  const size = token.size ?? DEFAULT_CARD_TOKEN_WIDTH;

  return (
    <Box
      // bottom-right, above the Tokens/Actions pill stack — the top-right
      // corner belongs to the activity log, which would cover this panel
      position="absolute"
      bottom="6.25rem"
      right="1rem"
      zIndex={250}
      bg="brand.parchment"
      color="brand.surfaceDim"
      borderRadius="0.75rem"
      border="1px solid rgba(72, 40, 79, 0.35)"
      boxShadow="0 6px 18px rgba(20, 8, 24, 0.35)"
      p="0.75rem"
      w="15rem"
    >
      <Flex justify="space-between" align="center" mb="0.5rem">
        <Text
          fontFamily="SpaceGrotesk"
          fontWeight={700}
          fontSize="0.8rem"
          textTransform="uppercase"
          letterSpacing="0.06em"
          noOfLines={1}
          title={token.card?.title}
        >
          {token.card?.title ?? "Card"}
        </Text>
        <IconButton
          aria-label="Close"
          icon={<CloseIcon boxSize="0.6rem" />}
          size="xs"
          variant="ghost"
          onClick={onClose}
        />
      </Flex>

      <Button
        size="sm"
        w="100%"
        mb="0.5rem"
        leftIcon={<RepeatIcon />}
        onClick={onFlip}
      >
        {token.faceDown ? "Flip face-up" : "Flip face-down"}
      </Button>

      <Flex gap="0.5rem" mb="0.5rem">
        <Button size="sm" flex={1} onClick={onToHand}>
          To hand
        </Button>
        <Button size="sm" flex={1} onClick={onToDiscard}>
          Discard
        </Button>
      </Flex>
      <Flex gap="0.5rem" mb="0.75rem">
        <Button size="sm" flex={1} variant="outline" onClick={onToDeckTop}>
          Deck top
        </Button>
        <Button size="sm" flex={1} variant="outline" onClick={onToDeckBottom}>
          Deck bottom
        </Button>
      </Flex>

      <Text fontSize="0.75rem" opacity={0.7} mb="0.1rem">
        Size
      </Text>
      <Slider
        aria-label="Card size"
        min={50}
        max={260}
        value={size}
        onChange={(next) => onResize(next, cardTokenHeight(next))}
      >
        <SliderTrack>
          <SliderFilledTrack bg="brand.secondary" />
        </SliderTrack>
        <SliderThumb />
      </Slider>
    </Box>
  );
};
