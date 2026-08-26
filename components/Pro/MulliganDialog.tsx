/**
 * Opening-hand mulligan window (issue #622 ↔ engine #395). One whole-attention
 * decision at game start, so it takes the screen rather than a corner of the
 * dock: modeled on ForfeitDialog / UndoRequestDialog, but undismissable — Esc
 * and the overlay do nothing, because the game does not continue until this seat
 * answers and there is no "later" to defer to.
 *
 * The buttons are the SERVER's options, rendered under the server's labels and
 * answered by option id (lib/pro/mulligan.ts only classifies them so the redraw
 * can be styled apart from the keep). Once this seat has answered, the dialog
 * stays up in a waiting state until the engine closes the window: it reports
 * only what YOU chose. The opponent's answer is redacted until both have
 * decided, and it reaches the player through the activity log, never from here.
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
  Flex,
  Spinner,
  Text,
} from "@chakra-ui/react";
import { CardFace } from "@/components/Pro/ProHand";
import { MoveTimerBar } from "@/components/Pro/ProHud";
import type { CardInstanceId, LegalOption } from "@/lib/pro/protocol";
import type { ResolveCard } from "@/lib/pro/useProCardArt";
import { MulliganChoice, decidedLabel, mulliganChoiceOf } from "@/lib/pro/mulligan";

/** Five cards abreast at 6.5rem needs ~34rem; a 390px phone has ~23rem inside
 *  the dialog, so the hand steps down under Chakra's `sm` (issue #708). Pure
 *  CSS breakpoints — nothing here reads `window`, and >= 30em is unchanged. */
const CARD_W = { base: "4.4rem", sm: "6.5rem" };

export interface MulliganDialogProps {
  isOpen: boolean;
  /** the hand as it stands right now (5 cards; re-rendered after a redraw) */
  hand: CardInstanceId[];
  resolveCard: ResolveCard;
  /** text fallback while art loads / when a title doesn't match */
  labelFor: (instance: CardInstanceId) => string;
  /** options the server offered THIS seat — empty while the opponent decides */
  options: LegalOption[];
  /** true while this seat is the one being asked and has not answered yet */
  awaitingYou: boolean;
  /** what this seat already answered (local echo), null before answering */
  decided: MulliganChoice | null;
  /** ffa/team room — "your opponent" is the wrong noun with three seats at the table */
  multiplayer?: boolean;
  /**
   * This seat's running move clock (issue #223), when the room is timed and the
   * server armed one for THIS decision. The modal covers the HUD's own bar, so
   * the countdown has to come with it — a timed window whose clock you cannot
   * see is the one way this dialog could cost someone the game.
   */
  timer?: { deadline: number; totalSeconds: number } | null;
  onChoose: (optionId: string) => void;
}

export const MulliganDialog = ({
  isOpen,
  hand,
  resolveCard,
  labelFor,
  options,
  awaitingYou,
  decided,
  multiplayer = false,
  timer = null,
  onChoose,
}: MulliganDialogProps) => {
  const focusRef = useRef<HTMLButtonElement>(null);
  const answered = !awaitingYou;
  const others = multiplayer ? "the other players" : "your opponent";

  return (
    <AlertDialog
      isOpen={isOpen}
      leastDestructiveRef={focusRef}
      // No way out but a choice: the engine holds the game on this window.
      onClose={() => undefined}
      closeOnEsc={false}
      closeOnOverlayClick={false}
      isCentered
      size="xl"
    >
      <AlertDialogOverlay>
        <AlertDialogContent bg="brand.surfaceDim" color="brand.parchment" maxW="min(46rem, 94vw)">
          <AlertDialogHeader fontFamily="LeagueGothic" letterSpacing="0.04em" fontSize="1.5rem">
            Your opening hand
          </AlertDialogHeader>
          <AlertDialogBody>
            <Text mb="0.75rem" fontSize="0.95rem">
              Keep these five cards, or shuffle them back and draw five new ones.
              One mulligan per game — {others} {multiplayer ? "decide" : "decides"} at
              the same time, and nobody sees anyone else&apos;s choice until every
              seat has answered.
            </Text>

            <Flex justifyContent="center" alignItems="flex-end" gap="0.4rem" flexWrap="wrap" mb="0.5rem">
              {hand.map((instance) => (
                <Box key={instance} w={CARD_W} sx={{ aspectRatio: "63 / 88" }} flexShrink={0}>
                  <CardFace card={resolveCard(instance)} fallback={labelFor(instance)} />
                </Box>
              ))}
            </Flex>

            {timer && (
              <Box mt="0.4rem" mx="-0.5rem">
                <MoveTimerBar deadline={timer.deadline} totalSeconds={timer.totalSeconds} />
              </Box>
            )}

            {answered && (
              <Text mt="0.6rem" fontSize="0.9rem" opacity={0.8} textAlign="center">
                {decided
                  ? `${decidedLabel(decided)} · waiting for ${others}…`
                  : multiplayer
                    ? "The other players are deciding…"
                    : "Your opponent is deciding…"}
              </Text>
            )}
          </AlertDialogBody>
          {/* The server's option labels are whole sentences ("Shuffle your hand
              back and draw a new one"), which at 390px overlapped each other in
              a nowrap row. Stack them under `sm` and let each wrap to its own
              full-width, growable button. */}
          <AlertDialogFooter
            gap="0.6rem"
            justifyContent="center"
            flexDirection={{ base: "column", sm: "row" }}
            flexWrap="wrap"
          >
            {awaitingYou ? (
              options.map((option, i) => {
                const choice = mulliganChoiceOf(option);
                return (
                  <Button
                    key={option.id}
                    ref={i === 0 ? focusRef : undefined}
                    colorScheme={choice === "MULLIGAN" ? "orange" : "green"}
                    variant={choice === "MULLIGAN" ? "outline" : "solid"}
                    onClick={() => onChoose(option.id)}
                    w={{ base: "100%", sm: "auto" }}
                    whiteSpace="normal"
                    height="auto"
                    minH="2.5rem"
                    py="0.5rem"
                    lineHeight="1.2"
                  >
                    {option.label}
                  </Button>
                );
              })
            ) : (
              // Waiting: the body line already says whose turn it is to decide,
              // so the footer only has to look busy — a second copy of the same
              // sentence as a dead button reads like a control that does nothing.
              <Spinner size="sm" opacity={0.6} speed="1.2s" aria-label="waiting" />
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogOverlay>
    </AlertDialog>
  );
};
