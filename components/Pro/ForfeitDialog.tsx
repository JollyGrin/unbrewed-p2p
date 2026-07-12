/**
 * Forfeit / resign confirmation (issue #140, paired with engine #32). Conceding
 * is destructive, so it MUST NOT be a one-click misfire — this AlertDialog gates
 * the `FORFEIT` action behind an explicit confirm. On confirm the caller sends
 * `{ type: "FORFEIT", player }` and the server broadcasts the resulting STATE.
 *
 * The stakes differ by format (unbrewed-engine #117), so the body copy adapts:
 * in a duel it hands the opponent the win; in multiplayer it resigns YOUR seat
 * (your fighters are swept) and the match MAY play on without you. Whether it
 * actually continues is the server's human-stake call (a solo human forfeiting
 * ends it at once) — knowledge the client doesn't have — so the copy stays
 * conditional ("if the match continues…") rather than promising a spectate view.
 */
import { useRef } from "react";
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Button,
} from "@chakra-ui/react";

export const ForfeitDialog = ({
  isOpen,
  onClose,
  onConfirm,
  multiplayer = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  /** multiplayer (ffa/team) forfeit resigns a seat rather than ending the game */
  multiplayer?: boolean;
}) => {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <AlertDialog isOpen={isOpen} leastDestructiveRef={cancelRef} onClose={onClose} isCentered>
      <AlertDialogOverlay>
        <AlertDialogContent bg="brand.surfaceDim" color="brand.parchment">
          <AlertDialogHeader fontFamily="LeagueGothic" letterSpacing="0.04em" fontSize="1.5rem">
            Forfeit the game?
          </AlertDialogHeader>
          <AlertDialogBody>
            {multiplayer
              ? "You resign your seat and its fighters are removed. If the match continues without you, you can keep watching. This cannot be undone."
              : "Your opponent wins. This cannot be undone."}
          </AlertDialogBody>
          <AlertDialogFooter gap="0.6rem">
            <Button ref={cancelRef} onClick={onClose} variant="ghost" color="brand.parchment">
              Keep playing
            </Button>
            <Button
              colorScheme="red"
              onClick={() => {
                onConfirm();
                onClose();
              }}
            >
              Forfeit
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogOverlay>
    </AlertDialog>
  );
};
