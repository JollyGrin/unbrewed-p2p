//@ts-nocheck
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  Button,
  useDisclosure,
  Text,
} from "@chakra-ui/react";
import React from "react";
import { DeckModalContent } from "./game.modal-body";

export const ModalTemplate = ({ isOpen, onOpen, onClose, children }) => {
  const OverlayOne = () => (
    <ModalOverlay
      bg="blackAlpha.300"
      backdropFilter="blur(10px) hue-rotate(10deg)"
    />
  );

  //   const [overlay, setOverlay] = React.useState(<OverlayOne />);

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose}>
        <OverlayOne />
        <ModalContent maxW={"1100px"} w={"100%"}>
          <ModalHeader>Deck</ModalHeader>
          <ModalCloseButton />
          {/* <ModalBody>{children}</ModalBody> */}
          <ModalBody>
            <DeckModalContent />
          </ModalBody>
          {/* <ModalFooter>
            <Button onClick={onClose}>Close</Button>
          </ModalFooter> */}
        </ModalContent>
      </Modal>
    </>
  );
};
