/**
 * "Your seat is held in room CODE" (#1248): shown instead of ever POSTing
 * `…/ready` a second time when this player already holds a live seat for the
 * match (a stale tab, or the api's `seat_held` decision).
 */
import { Flex, Text } from "@chakra-ui/react";

import { Btn } from "./ui";

export const seatHeldHref = (roomId: string | null): string | null =>
  roomId ? `/pro/game?room=${encodeURIComponent(roomId)}` : null;

export const SeatHeldNote = ({ roomId, onRetry, dark = false }: { roomId: string | null; onRetry?: () => void; dark?: boolean }) => {
  const href = seatHeldHref(roomId);
  return (
    <Flex flexDir="column" gap="8px" mt="8px" data-testid="seat-held-note" role="status">
      <Text fontSize="13px" fontWeight={600} color={dark ? "#FF8A73" : undefined}>
        {roomId ? `Your seat is held in room ${roomId}.` : "Your seat is held in a room that's still opening."} Carry on there, or check again if it has closed.
      </Text>
      <Flex gap="8px" flexWrap="wrap">
        {href && <Btn variant="gold" href={href}>Back to your room</Btn>}
        {onRetry && <Btn variant={dark ? "ghost" : "ink"} onClick={onRetry} {...(dark ? { color: "#FAEBD7" } : {})}>Check again</Btn>}
      </Flex>
    </Flex>
  );
};
