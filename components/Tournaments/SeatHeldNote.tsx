/**
 * "Your seat is held in this match's room" (#1248; no room code, UX S6): shown instead of ever POSTing
 * `…/ready` a second time when this player already holds a live seat for the
 * match (a stale tab, or the api's `seat_held` decision).
 */
import { Flex, Text } from "@chakra-ui/react";

import { Btn } from "./ui";

export const seatHeldHref = (roomId: string | null): string | null =>
  roomId ? `/pro/game?room=${encodeURIComponent(roomId)}` : null;

/**
 * "Back to your room" with a fresh join ticket (p2p #1250): the stored token
 * may be dead (the engine released the seat), and the ticket is the way back
 * in. The link's own href stays for a middle-click.
 */
export const backTo = (roomId: string | null, onBack?: (roomId: string) => void) =>
  roomId && onBack
    ? (e: React.MouseEvent) => {
        e.preventDefault();
        onBack(roomId);
      }
    : undefined;

export const SeatHeldNote = ({
  roomId,
  onRetry,
  onBack,
  dark = false,
}: {
  roomId: string | null;
  onRetry?: () => void;
  /** Go back with a fresh join ticket (p2p #1250); without it, a plain room link. */
  onBack?: (roomId: string) => void;
  dark?: boolean;
}) => {
  const href = seatHeldHref(roomId);
  return (
    <Flex flexDir="column" gap="8px" mt="8px" data-testid="seat-held-note" role="status">
      <Text fontSize="13px" fontWeight={600} color={dark ? "#FF8A73" : undefined}>
        {roomId ? "Your seat is held in this match's room." : "Your seat is held in a room that's still opening."} Carry on there, or check again if it has closed.
      </Text>
      <Flex gap="8px" flexWrap="wrap">
        {href && (
          <Btn
            variant="gold"
            href={href}
            onClick={backTo(roomId, onBack)}
          >
            Back to your room
          </Btn>
        )}
        {onRetry && <Btn variant={dark ? "ghost" : "ink"} onClick={onRetry} {...(dark ? { color: "#FAEBD7" } : {})}>Check again</Btn>}
      </Flex>
    </Flex>
  );
};
