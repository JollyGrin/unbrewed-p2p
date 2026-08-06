/**
 * The level + XP bar in the /account profile header (issue #577).
 *
 * The whole thing hides when the API didn't send the progression block — a
 * client deployed ahead of its API is the expected case, not an error case, and
 * a zeroed bar would claim the player is level 0 when the truth is that nobody
 * asked. `levelProgress` returns null for exactly that, which is why this
 * component is a single early return over one pure function.
 */
import { Box, Flex, Text } from "@chakra-ui/react";

import { LevelProgress } from "@/lib/account/stats";

export const AccountLevelBar = ({
  progress,
}: {
  progress: LevelProgress | null;
}) => {
  if (!progress) return null;
  const { level, percent, toGo } = progress;

  return (
    <Box data-testid="account-level" mt="0.35rem" minW={0} maxW="16rem">
      <Flex align="baseline" gap="0.35rem" minW={0}>
        <Text
          fontFamily="ArchivoNarrow"
          fontSize="0.72rem"
          letterSpacing="0.06em"
          textTransform="uppercase"
          opacity={0.65}
        >
          Level
        </Text>
        <Text
          data-testid="account-level-number"
          fontFamily="LeagueGothic"
          fontSize="1.15rem"
          lineHeight="1"
        >
          {level}
        </Text>
        <Text fontSize="0.7rem" opacity={0.6} whiteSpace="nowrap">
          {/* "XP to go" rather than "x/y XP": the number a player acts on is the
              distance, and the bar already carries the ratio. */}
          {toGo > 0 ? `${toGo.toLocaleString()} XP to go` : "next level ready"}
        </Text>
      </Flex>
      <Box
        data-testid="account-level-bar"
        // The bar is decorative; the numbers above it are the accessible copy,
        // so one labelled progressbar replaces both for a screen reader.
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={`Level ${level}, ${percent}% to the next level`}
        mt="0.2rem"
        h="0.35rem"
        borderRadius="full"
        bg="rgba(72, 40, 79, 0.15)"
        overflow="hidden"
      >
        <Box
          data-testid="account-level-fill"
          h="100%"
          w={`${percent}%`}
          borderRadius="full"
          bg="brand.secondary"
          transition="width 300ms ease"
        />
      </Box>
    </Box>
  );
};
