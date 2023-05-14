import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  Button,
  Box,
  Text,
} from "@chakra-ui/react";
import { SettingsContainer } from "./settings.container";
import { GITHUB_REPO_URL } from "@/lib/constants/global-constants";
import Link from "next/link";

type SettingsModalType = {
  isOpen: boolean;
  onClose: () => void;
  serverStorage: {
    activeServer: string;
    setActiveServer: (server: string) => void;
    serverList: string[];
  };
};
export const SettingsModal: React.FC<SettingsModalType> = ({
  isOpen,
  onClose,
  serverStorage,
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} size={"2xl"}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>GameServer Settings</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Box
            bg="paleturquoise"
            color="darkslategray"
            borderRadius="1rem"
            fontFamily="SpaceGrotesk"
            p={3}
            opacity={0.6}
          >
            <Text>
              Unbrewed has an opensource game server which can be run by anyone.
              To update which gameserver you connect to, paste the URL below.
              <br />
              <br />
              To run your own gameserver for free (from your computer) <br />
              <Link href={GITHUB_REPO_URL}>
                <u>check out the github.</u>
              </Link>
            </Text>
          </Box>
          <SettingsContainer {...serverStorage} />
        </ModalBody>

        <ModalFooter>
          <Button colorScheme="blue" mr={3} onClick={onClose}>
            Close
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
