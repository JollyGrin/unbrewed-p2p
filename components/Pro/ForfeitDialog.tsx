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
 *
 * A signed-in player also sees what conceding costs them (#636, telemetry #66):
 * a forfeited game pays the forfeiter NOTHING toward cosmetic points, where a
 * loss played to the end still pays for having played. That is a rule a player
 * has to learn BEFORE the click, not from a balance that didn't move — so it
 * rides in the confirmation itself. Guests have no balance to lose and see the
 * dialog exactly as it is today.
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
  Text,
} from "@chakra-ui/react";

/** Verbatim in the tests — this is a disclosure, not decoration. */
export const FORFEIT_POINTS_NOTE =
  "Forfeiting earns no cosmetic points for this game — a loss played out still does.";

export const ForfeitDialog = ({
  isOpen,
  onClose,
  onConfirm,
  multiplayer = false,
  signedIn = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  /** multiplayer (ffa/team) forfeit resigns a seat rather than ending the game */
  multiplayer?: boolean;
  /** signed in, so cosmetic points are on the line and the note applies */
  signedIn?: boolean;
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
            {signedIn && (
              <Text fontSize="0.8rem" opacity={0.75} mt="0.6rem" data-testid="forfeit-points-note">
                {FORFEIT_POINTS_NOTE}
              </Text>
            )}
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
