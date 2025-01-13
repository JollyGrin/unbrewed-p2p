import { CardFactory } from "@/components/CardFactory/card.factory";
import { DeckImportCardType } from "@/components/DeckPool/deck-import.type";
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
  Grid,
} from "@chakra-ui/react";

export const DiscardModalReadOnly = (props: {
  isOpen: boolean;
  onClose: () => void;
  cards: DeckImportCardType[];
}) => {
  return (
    <>
      <Modal isOpen={props.isOpen} onClose={props.onClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Discard</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Grid gridTemplateColumns="1fr 1fr 1fr">
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
