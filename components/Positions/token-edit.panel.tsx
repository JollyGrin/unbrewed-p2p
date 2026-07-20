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
import { CloseIcon, DeleteIcon, LockIcon, UnlockIcon } from "@chakra-ui/icons";
import { FC } from "react";
import { BoardToken, DEFAULT_TOKEN_SIZE } from "./position.type";

/**
 * Floating controls for a selected image piece (picture token or map
 * overlay): resize, lock overlays in place, delete. Discs and icons are
 * managed from the token menu instead, so this never opens for them.
 */
export const TokenEditPanel: FC<{
  token: BoardToken;
  onChange: (patch: Partial<BoardToken>) => void;
  onDelete: () => void;
  onClose: () => void;
}> = ({ token, onChange, onDelete, onClose }) => {
  const isOverlay = Boolean(token.overlay);
  const size = token.size ?? DEFAULT_TOKEN_SIZE;
  const aspect = token.h ? token.h / (token.size || 1) : 1;

  const resize = (next: number) =>
    onChange({ size: next, h: Math.round(next * aspect) });

  return (
    <Box
      // Bottom-right above the hand, matching CardTokenPanel and
      // CardPickupPanel — the other two on-board selection panels, which are
      // mutually exclusive with this one. The old top-right corner put it
      // under the HUD cluster (Invite / Report bug / Activity log), which
      // covered Size and hid Delete behind the activity feed; z-indexing over
      // the Activity log would only have inverted the problem.
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
        >
          {isOverlay ? "Map overlay" : "Image piece"}
        </Text>
        <IconButton
          aria-label="Close"
          icon={<CloseIcon boxSize="0.6rem" />}
          size="xs"
          variant="ghost"
          onClick={onClose}
        />
      </Flex>

      <Text fontSize="0.75rem" opacity={0.7} mb="0.1rem">
        Size
      </Text>
      <Slider
        aria-label="Piece size"
        min={isOverlay ? 100 : 24}
        max={isOverlay ? 1200 : 300}
        value={size}
        onChange={resize}
        mb="0.75rem"
      >
        <SliderTrack>
          <SliderFilledTrack bg="brand.secondary" />
        </SliderTrack>
        <SliderThumb />
      </Slider>

      <Flex gap="0.5rem">
        {isOverlay && (
          <Button
            size="sm"
            flex={1}
            leftIcon={token.locked ? <UnlockIcon /> : <LockIcon />}
            onClick={() => {
              onChange({ locked: !token.locked });
              if (!token.locked) onClose();
            }}
          >
            {token.locked ? "Unlock" : "Lock"}
          </Button>
        )}
        <Button
          size="sm"
          flex={1}
          colorScheme="red"
          variant="outline"
          leftIcon={<DeleteIcon />}
          onClick={onDelete}
        >
          Delete
        </Button>
      </Flex>
    </Box>
  );
};
