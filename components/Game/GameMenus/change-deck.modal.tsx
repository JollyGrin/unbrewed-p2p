import {
  Box,
  Button,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
} from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { SelectedDeckContainer } from "@/components/Connect/SelectedDeck";
import { useBagDecks } from "@/lib/bag/useBag";
import { useWebGame } from "@/lib/contexts/WebGameProvider";
import { colors, fonts } from "@/styles/style";

/**
 * In-game hero swap (issue #493, tier 1). Deck choice used to be
 * localStorage-only — set from /connect or /bag — so switching heroes meant
 * leaving the lobby. This touches only the local player: a new pool, the new
 * deck's loadout on the table, and a log line the opponent sees.
 *
 * The picker itself is /connect's `SelectedDeckContainer`, with its /bag links
 * turned off so a mis-click can't navigate out of the game.
 */
export const ChangeDeckModal = (props: {
  isOpen: boolean;
  onClose: () => void;
}) => {
  const { decks, starredDeck, setStar } = useBagDecks();
  const { switchDeck } = useWebGame();
  const [selectedId, setSelectedId] = useState<string>();

  // Open on whatever is starred right now; the picker's own state drives the
  // preview until the switch is confirmed.
  useEffect(() => {
    if (props.isOpen) setSelectedId(starredDeck?.id);
  }, [props.isOpen, starredDeck?.id]);

  const selected = decks?.find((deck) => deck.id === selectedId);
  const isCurrent = !!selected && selected.id === starredDeck?.id;

  const confirm = () => {
    if (!selected) return;
    setStar(selected.id);
    switchDeck(selected);
    toast.success(`Switched to ${selected.deck_data?.hero?.name ?? selected.name}`);
    props.onClose();
  };

  return (
    <Modal isOpen={props.isOpen} onClose={props.onClose} isCentered>
      <ModalOverlay bg="rgba(20, 8, 24, 0.55)" backdropFilter="blur(8px)" />
      <ModalContent
        bg={colors.brand.parchment}
        color={colors.brand.surfaceDim}
        borderRadius="1rem"
        border="1px solid rgba(72, 40, 79, 0.35)"
      >
        <ModalHeader fontFamily={fonts.SpaceGrotesk} fontWeight={700}>
          Change my deck
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <SelectedDeckContainer
            decks={decks}
            starredDeck={selected}
            setStar={setSelectedId}
            linkToBag={false}
          />
          <Box mt="1rem" fontSize="0.85rem" opacity={0.8}>
            <Text>
              Switching replaces your deck, hand and discard, and clears your
              cards off the table. Your opponent keeps playing — only your side
              of the board changes.
            </Text>
          </Box>
        </ModalBody>
        <ModalFooter>
          <Button onClick={props.onClose}>Cancel</Button>
          <Button
            ml="0.75rem"
            isDisabled={!selected || isCurrent}
            bg={colors.brand.accent}
            color={colors.brand.surfaceDim}
            fontFamily={fonts.SpaceGrotesk}
            fontWeight={700}
            _hover={{ bg: colors.brand.accentDeep }}
            onClick={confirm}
          >
            {isCurrent ? "Already playing this" : "Switch deck"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
