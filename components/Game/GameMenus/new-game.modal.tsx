import {
  Button,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
  UnorderedList,
  ListItem,
  Flex,
  Spinner,
} from "@chakra-ui/react";
import { useWebGame } from "@/lib/contexts/WebGameProvider";
import { useBagDecks } from "@/lib/bag/useBag";
import { colors, fonts } from "@/styles/style";

const whatDies = (isSolo: boolean) => [
  isSolo
    ? "Your deck, hand and discard"
    : "Every player's deck, hand and discard",
  "Every card and token on the table",
  "The action log",
];

/**
 * Proposer's side of "New game" (issue #493, tier 2). A room-wide wipe is
 * destructive for everyone, so — unlike the map, which any player just changes
 * — it asks: the request goes out on our blob and the other seats accept it.
 *
 * The waiting state is the same dialog, because a ghost blob (a player who
 * closed their tab; the relay has no liveness signal) can never answer, and
 * this is where "Reset anyway" appears once the request expires.
 */
export const NewGameModal = (props: {
  isOpen: boolean;
  onClose: () => void;
  onChangeDeck: () => void;
  /** Nobody else is playing — commit happens immediately, with no consent. */
  isSolo: boolean;
}) => {
  const { resetStatus, requestGameReset, cancelGameReset, forceGameReset } =
    useWebGame();
  const { starredDeck } = useBagDecks();
  const pending = resetStatus.pending;

  const close = () => props.onClose();

  return (
    <Modal isOpen={props.isOpen} onClose={close} isCentered>
      <ModalOverlay bg="rgba(20, 8, 24, 0.55)" backdropFilter="blur(8px)" />
      <ModalContent
        bg={colors.brand.parchment}
        color={colors.brand.surfaceDim}
        borderRadius="1rem"
        border="1px solid rgba(72, 40, 79, 0.35)"
      >
        <ModalHeader fontFamily={fonts.SpaceGrotesk} fontWeight={700}>
          {pending ? "Waiting for the others…" : "Start a new game?"}
        </ModalHeader>
        <ModalCloseButton />

        {pending ? (
          <>
            <ModalBody>
              <Flex align="center" gap="0.6rem">
                <Spinner size="sm" color={colors.brand.accentDeep} />
                <Text>
                  Waiting for {pending.waitingOn.join(", ")} to accept.
                </Text>
              </Flex>
              {pending.canForce && (
                <Text mt="0.75rem" fontSize="0.85rem" opacity={0.8}>
                  No answer yet — they may have closed the game. You can reset
                  anyway; anyone still connected will be reset too.
                </Text>
              )}
            </ModalBody>
            <ModalFooter>
              <Button
                onClick={() => {
                  cancelGameReset();
                  close();
                }}
              >
                Cancel
              </Button>
              {pending.canForce && (
                <Button
                  ml="0.75rem"
                  bg={colors.brand.danger}
                  color="white"
                  fontFamily={fonts.SpaceGrotesk}
                  fontWeight={700}
                  onClick={() => {
                    forceGameReset();
                    close();
                  }}
                >
                  Reset anyway
                </Button>
              )}
            </ModalFooter>
          </>
        ) : (
          <>
            <ModalBody>
              <Text fontSize="0.9rem">
                You&apos;ll play{" "}
                <Text as="span" fontWeight={700}>
                  {starredDeck?.deck_data?.hero?.name ??
                    starredDeck?.name ??
                    "your starred deck"}
                </Text>{" "}
                <Text
                  as="span"
                  textDecoration="underline"
                  cursor="pointer"
                  onClick={props.onChangeDeck}
                >
                  Change
                </Text>
              </Text>
              <Text mt="0.75rem" fontSize="0.9rem">
                This clears:
              </Text>
              <UnorderedList fontSize="0.85rem" opacity={0.85}>
                {whatDies(props.isSolo).map((line) => (
                  <ListItem key={line}>{line}</ListItem>
                ))}
              </UnorderedList>
              <Text mt="0.5rem" fontSize="0.85rem" opacity={0.8}>
                The map stays as it is.
              </Text>
            </ModalBody>
            <ModalFooter>
              <Button onClick={close}>Cancel</Button>
              <Button
                ml="0.75rem"
                bg={colors.brand.accent}
                color={colors.brand.surfaceDim}
                fontFamily={fonts.SpaceGrotesk}
                fontWeight={700}
                _hover={{ bg: colors.brand.accentDeep }}
                onClick={() => {
                  requestGameReset();
                  // Solo commits on the spot; with opponents the dialog stays
                  // open and flips to the waiting state.
                  if (props.isSolo) close();
                }}
              >
                {props.isSolo ? "Start a new game" : "Ask for a new game"}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};

/**
 * The other seats' side: someone proposed a wipe. Answering is stamped as a
 * vote on OUR blob, so it survives a refresh and is idempotent.
 */
export const ResetPromptDialog = () => {
  const { resetStatus, respondGameReset } = useWebGame();
  const incoming = resetStatus.incoming;

  return (
    <Modal
      isOpen={!!incoming}
      onClose={() => incoming && respondGameReset(incoming.request.id, false)}
      isCentered
    >
      <ModalOverlay bg="rgba(20, 8, 24, 0.55)" backdropFilter="blur(8px)" />
      <ModalContent
        bg={colors.brand.parchment}
        color={colors.brand.surfaceDim}
        borderRadius="1rem"
        border="1px solid rgba(72, 40, 79, 0.35)"
      >
        <ModalHeader fontFamily={fonts.SpaceGrotesk} fontWeight={700}>
          {incoming?.from} wants to start a new game
        </ModalHeader>
        <ModalBody>
          <Text fontSize="0.9rem">
            Your deck, hand, discard and table cards will be cleared, and
            everyone re-draws a fresh hand. The map stays as it is.
          </Text>
        </ModalBody>
        <ModalFooter>
          <Button
            onClick={() =>
              incoming && respondGameReset(incoming.request.id, false)
            }
          >
            Decline
          </Button>
          <Button
            ml="0.75rem"
            bg={colors.brand.accent}
            color={colors.brand.surfaceDim}
            fontFamily={fonts.SpaceGrotesk}
            fontWeight={700}
            _hover={{ bg: colors.brand.accentDeep }}
            onClick={() =>
              incoming && respondGameReset(incoming.request.id, true)
            }
          >
            Accept
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
