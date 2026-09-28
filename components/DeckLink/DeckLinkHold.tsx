import {
  Button,
  HStack,
  Modal,
  ModalBody,
  ModalContent,
  ModalOverlay,
} from "@chakra-ui/react";
import Link from "next/link";
import { CloseButton } from "@chakra-ui/react";

import { LabsSkippedSummary } from "@/components/Bag/AddDeckHub/LabsSkipped";

import { LabsUnsupportedWarning } from "@/components/Bag/AddDeckHub/LabsUnsupported";
import { DeckLinkState } from "@/lib/hooks/useDeckLink";

/**
 * The Labs guidance for a linked deck our template can't draw (#979).
 *
 * A first import shows it in place of the table. A refresh (#996) shows it
 * over the table, which keeps playing the saved copy until the player picks.
 */
export const DeckLinkHold = ({ link }: { link: DeckLinkState }) => {
  const { held } = link;
  if (!held) return null;

  const warning = (
    <LabsUnsupportedWarning deckName={held.deck.name} unsupported={held.unsupported}>
      <HStack mt="0.75rem" spacing="0.5rem" wrap="wrap">
        <Button size="sm" colorScheme="orange" onClick={link.playAnyway}>
          Play anyway
        </Button>
        {held.refresh ? (
          <Button size="sm" variant="outline" onClick={link.keepSaved}>
            Keep my saved copy
          </Button>
        ) : (
          <Button size="sm" as={Link} href="/bag" variant="outline">
            Open your bag
          </Button>
        )}
      </HStack>
    </LabsUnsupportedWarning>
  );

  if (!held.refresh) return warning;
  return (
    <Modal isOpen onClose={link.keepSaved} isCentered size="xl">
      <ModalOverlay />
      <ModalContent bg="transparent" boxShadow="none" mx="16px">
        <ModalBody p={0}>{warning}</ModalBody>
      </ModalContent>
    </Modal>
  );
};

/**
 * What the Labs set holds that wasn't imported (#1000): a dismissible note
 * over the table, shown once the deck has loaded. It never holds the table.
 */
export const DeckLinkNotice = ({ link }: { link: DeckLinkState }) => {
  const { notice } = link;
  if (!notice) return null;
  return (
    <HStack
      role="status"
      position="fixed"
      bottom="12px"
      left="12px"
      right="12px"
      maxW="520px"
      mx="auto"
      zIndex={1500}
      align="flex-start"
      p="0.75rem"
      borderRadius="0.5rem"
      bg="brand.parchment"
      color="brand.secondary"
      boxShadow="lg"
    >
      <LabsSkippedSummary skipped={notice.skipped} sourceUrl={notice.sourceUrl} />
      <CloseButton aria-label="Dismiss" size="sm" onClick={link.dismissNotice} />
    </HStack>
  );
};
