import { Box, Button, Flex, Text } from "@chakra-ui/react";

// Same purple glass as the Adventure overlay's panels (AdventureBoard PANEL). Its own
// module so the lobby's game-start fault (no STATE yet) doesn't pull the overlay in.
const PANEL = {
  bg: "rgba(20,8,24,0.72)",
  color: "white",
  border: "1px solid rgba(231,204,152,0.14)",
  borderRadius: "md",
  px: "0.6rem",
  py: "0.4rem",
  backdropFilter: "blur(4px)",
  minW: 0,
  maxW: "100%",
} as const;

export const ENGINE_FAULT_FIXTURE =
  "room ab12: resolving ENEMY_TURN — TypeError: cannot read properties of undefined (reading 'hp')";

/**
 * Table-level "game stopped" state (engine #666, A26): a persistent banner, not a toast.
 * The board stays as last drawn; the only ways out are leave / new game.
 */
export const EngineFaultBanner = ({
  message,
  onLeave = () => {
    window.location.href = "/pro/game";
  },
}: {
  message: string;
  onLeave?: () => void;
}) => (
  <Flex
    role="alert"
    data-testid="adv-engine-fault"
    direction="column"
    gap="0.4rem"
    align="center"
    pointerEvents="auto"
    {...PANEL}
    maxW="32rem"
    borderWidth="1px"
    borderColor="red.400"
  >
    <Text fontWeight="bold" fontSize="0.9rem" data-testid="adv-engine-fault-title">
      This game hit an engine fault and was stopped
    </Text>
    <Text fontSize="0.7rem" opacity={0.8}>
      Nobody won — the board is frozen as it was. Copy the details below when you report it.
    </Text>
    <Box
      as="pre"
      data-testid="adv-engine-fault-message"
      w="100%"
      p="0.4rem"
      bg="blackAlpha.600"
      borderRadius="sm"
      fontSize="0.65rem"
      whiteSpace="pre-wrap"
      wordBreak="break-word"
      userSelect="all"
    >
      {message}
    </Box>
    <Flex gap="0.4rem">
      <Button
        size="xs"
        data-testid="adv-engine-fault-copy"
        onClick={() => {
          try {
            void navigator.clipboard?.writeText(message);
          } catch {
            /* clipboard unavailable — the text is select-all */
          }
        }}
      >
        Copy diagnostic
      </Button>
      <Button size="xs" colorScheme="red" data-testid="adv-engine-fault-leave" onClick={onLeave}>
        Leave / new game
      </Button>
    </Flex>
  </Flex>
);
