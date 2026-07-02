import { CardFactory } from "@/components/CardFactory/card.factory";
import { DeckImportCardType } from "@/components/DeckPool/deck-import.type";
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  Grid,
  Text,
} from "@chakra-ui/react";

export const DiscardModalReadOnly = (props: {
  isOpen: boolean;
  onClose: () => void;
  cards: DeckImportCardType[];
}) => {
  return (
    <>
      <Modal isOpen={props.isOpen} onClose={props.onClose} size="4xl">
        <ModalOverlay bg="rgba(20, 8, 24, 0.55)" backdropFilter="blur(8px)" />
        <ModalContent
          bg="brand.parchment"
          borderRadius="1rem"
          border="1px solid rgba(72, 40, 79, 0.35)"
        >
          <ModalHeader
            fontFamily="BebasNeueRegular"
            fontSize="1.5rem"
            letterSpacing="0.05em"
            textTransform="uppercase"
            color="brand.secondary"
          >
            Discard
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb="1rem">
            {props.cards?.length === 0 && (
              <Text pb="1rem" opacity={0.7}>
                Nothing in the discard pile yet.
              </Text>
            )}
            <Grid gridTemplateColumns="1fr 1fr 1fr" gap="0.5rem">
              {props.cards?.map((card, i) => (
                <CardFactory key={card.title + i} card={card} />
              ))}
            </Grid>
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
};
