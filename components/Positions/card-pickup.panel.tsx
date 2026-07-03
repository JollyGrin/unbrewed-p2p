import { Box, Button, Flex, IconButton, Text } from "@chakra-ui/react";
import { CloseIcon } from "@chakra-ui/icons";
import { FC } from "react";
import { OwnedToken } from "./position.type";

/**
 * Floating panel for ANOTHER player's card token: request to pick it up.
 * The owner's client answers the claim (escrow → token removal), so the
 * button flips to a waiting state until the card lands in our hand.
 * Face-down cards keep their identity hidden — only the owner is named.
 */
export const CardPickupPanel: FC<{
  token: OwnedToken;
  /** Set when a claim for this token is already outstanding. */
  claimedBy?: string;
  self: string;
  onPickup: () => void;
  onClose: () => void;
}> = ({ token, claimedBy, self, onPickup, onClose }) => {
  const label = token.faceDown
    ? `${token.owner}'s face-down card`
    : token.card?.title ?? "Card";

  return (
    <Box
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
      <Flex justify="space-between" align="center" mb="0.25rem">
        <Text
          fontFamily="SpaceGrotesk"
          fontWeight={700}
          fontSize="0.8rem"
          textTransform="uppercase"
          letterSpacing="0.06em"
          noOfLines={1}
          title={label}
        >
          {label}
        </Text>
        <IconButton
          aria-label="Close"
          icon={<CloseIcon boxSize="0.6rem" />}
          size="xs"
          variant="ghost"
          onClick={onClose}
        />
      </Flex>
      <Text fontSize="0.75rem" opacity={0.7} mb="0.5rem">
        {token.owner}&apos;s card
      </Text>

      {claimedBy ? (
        <Button size="sm" w="100%" isDisabled>
          {claimedBy === self
            ? "Waiting for owner…"
            : `Requested by ${claimedBy}`}
        </Button>
      ) : (
        <Button size="sm" w="100%" onClick={onPickup}>
          Pick up card
        </Button>
      )}
    </Box>
  );
};
