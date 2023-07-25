import {
  Text,
  Button,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  Box,
  Flex,
} from "@chakra-ui/react";
import { FC, useState } from "react";
import { MoonIcon, SunIcon } from "@chakra-ui/icons";

export const PositionModal: FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  const [isDark, setIsDark] = useState(true);
  const toggle = () => setIsDark(!isDark);
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalOverlay />
      <ModalContent
        bg={isDark ? "purple.900" : "antiquewhite"}
        color={isDark ? "antiquewhite" : "purple.900"}
        transition="all 0.25s ease-in-out"
      >
        <ModalHeader as={Flex} gap="1rem">
          <Box onClick={toggle} cursor="pointer" userSelect="none">
            {isDark ? <SunIcon /> : <MoonIcon />}
          </Box>
          <Text>Your Board Tokens</Text>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>text</ModalBody>
      </ModalContent>
    </Modal>
  );
};
