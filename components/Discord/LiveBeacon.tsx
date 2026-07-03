import { Box, BoxProps } from "@chakra-ui/react";
import { keyframes } from "@emotion/react";

/** Discord's own "online" green — reads as a live presence dot. */
export const ONLINE_GREEN = "#3BA55D";

const pulse = keyframes`
  0%   { transform: scale(1);   opacity: 0.55; }
  70%  { transform: scale(2.6); opacity: 0;    }
  100% { transform: scale(2.6); opacity: 0;    }
`;

/**
 * A live "someone's here" beacon: a solid dot with an expanding ring that
 * breathes outward. The one small motion detail that signals the page is
 * pulling real, current data — not a static badge.
 */
export const LiveBeacon = ({
  size = "0.6rem",
  color = ONLINE_GREEN,
  ...rest
}: { size?: string; color?: string } & BoxProps) => (
  <Box position="relative" w={size} h={size} flexShrink={0} {...rest}>
    <Box
      position="absolute"
      inset={0}
      borderRadius="full"
      bg={color}
      animation={`${pulse} 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite`}
    />
    <Box
      position="absolute"
      inset={0}
      borderRadius="full"
      bg={color}
      boxShadow={`0 0 6px ${color}`}
    />
  </Box>
);
