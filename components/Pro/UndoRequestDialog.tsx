/**
 * Undo-request prompt (issue #154, paired with engine #39). When the opponent
 * asks to undo their last action, the server pushes UNDO_REQUESTED with the full
 * list of actions that will be rewound on accept — including any of THIS player's
 * own intervening moves. This AlertDialog surfaces that list so the decision is
 * informed: [Accept] rewinds the game and both boards snap back to just before the
 * requester's last discrete move; [Reject] changes nothing. Modeled on
 * ForfeitDialog. Nothing happens unless this player accepts.
 */
import { useRef } from "react";
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Box,
  Button,
  Text,
} from "@chakra-ui/react";
import type { PlayerId, UndoActionSummary } from "@/lib/pro/protocol";

export const UndoRequestDialog = ({
  isOpen,
  you,
  actions,
  onAccept,
  onReject,
}: {
  isOpen: boolean;
  /** the seat viewing this prompt (to flag which rewound actions are theirs) */
  you: PlayerId;
  /** every action that will be rewound on accept, in log order */
  actions: UndoActionSummary[];
  onAccept: () => void;
  onReject: () => void;
}) => {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const yourRewound = actions.filter((a) => a.player === you);

  return (
    // onClose maps to Reject: dismissing the prompt (Esc / overlay) must not
    // silently grant the undo — the least-destructive default is to decline.
    <AlertDialog isOpen={isOpen} leastDestructiveRef={cancelRef} onClose={onReject} isCentered>
      <AlertDialogOverlay>
        <AlertDialogContent bg="brand.surfaceDim" color="brand.parchment">
          <AlertDialogHeader fontFamily="LeagueGothic" letterSpacing="0.04em" fontSize="1.5rem">
            Undo requested
          </AlertDialogHeader>
          <AlertDialogBody>
            <Text mb="0.6rem">
              Your opponent wants to undo their last action. Accept to rewind the
              game to just before it; reject to keep playing as-is.
            </Text>

            {actions.length > 0 && (
              <Box
                as="ul"
                listStyleType="none"
                m="0"
                p="0.5rem 0.7rem"
                borderRadius="0.4rem"
                bg="rgba(20, 8, 24, 0.5)"
                fontSize="0.9rem"
              >
                <Text opacity={0.7} fontSize="0.8rem" mb="0.3rem" textTransform="uppercase" letterSpacing="0.06em">
                  This will rewind:
                </Text>
                {actions.map((a, i) => (
                  <Box as="li" key={i} display="flex" gap="0.4rem" alignItems="baseline">
                    <Text as="span" opacity={0.5}>
                      {a.player === you ? "you" : "them"}
                    </Text>
                    <Text as="span" fontWeight={a.player === you ? 700 : 400}>
                      {a.label}
                    </Text>
                  </Box>
                ))}
              </Box>
            )}

            {yourRewound.length > 0 && (
              <Text mt="0.6rem" color="brand.accent" fontWeight={600} fontSize="0.9rem">
                Heads up — this also undoes your:{" "}
                {yourRewound.map((a) => a.label).join(", ")}.
              </Text>
            )}
          </AlertDialogBody>
          <AlertDialogFooter gap="0.6rem">
            <Button ref={cancelRef} onClick={onReject} variant="ghost" color="brand.parchment">
              Reject
            </Button>
            <Button colorScheme="green" onClick={onAccept}>
              Accept
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogOverlay>
    </AlertDialog>
  );
};
