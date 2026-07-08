/**
 * Forfeit / resign confirmation (issue #140, paired with engine #32). Conceding
 * ends the game and hands the opponent the win, so it MUST NOT be a one-click
 * misfire — this AlertDialog gates the destructive `FORFEIT` action behind an
 * explicit confirm. On confirm the caller sends `{ type: "FORFEIT", player }`
 * and the server broadcasts the winner STATE that lights up the DEFEAT display.
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
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) => {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <AlertDialog isOpen={isOpen} leastDestructiveRef={cancelRef} onClose={onClose} isCentered>
      <AlertDialogOverlay>
        <AlertDialogContent bg="brand.surfaceDim" color="brand.parchment">
          <AlertDialogHeader fontFamily="LeagueGothic" letterSpacing="0.04em" fontSize="1.5rem">
            Forfeit the game?
          </AlertDialogHeader>
          <AlertDialogBody>Your opponent wins. This cannot be undone.</AlertDialogBody>
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
