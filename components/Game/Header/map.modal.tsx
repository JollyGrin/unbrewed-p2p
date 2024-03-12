import {
  Text,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  Button,
  Input,
  FormLabel,
  Image,
  Skeleton,
} from "@chakra-ui/react";
import { useRouter } from "next/router";
import { useState } from "react";
import { useDebounce } from "use-debounce";

export const MapModal = (props: { isOpen: boolean; onClose: () => void }) => {
  const { query, push } = useRouter();
  const [_url, setUrl] = useState(query.mapUrl as string | undefined);
  const [url] = useDebounce(_url, 300);

  return (
    <Modal isOpen={props.isOpen} onClose={props.onClose}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Change the Map</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <FormLabel>Map Image URL</FormLabel>
          <Input
            placeholder="https://someurl.com/map.svg"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />

          <Text mt="4px" fontSize="0.75rem">
            Changes local only. Share map link with friends you are playing
            with.
          </Text>
          <Text mt="4px" fontSize="0.75rem">
            Recommended 1200x1000
          </Text>
          {!url && <Skeleton h="250px" w="300px" borderRadius="0.5rem" />}
          {url && <Image alt="map" src={url} h="250px" />}
        </ModalBody>

        <ModalFooter>
          <Button
            variant="ghost"
            onClick={() => {
              const { mapUrl, ...rest } = query;
              setUrl(undefined);
              push({ query: { ...rest } });
            }}
          >
            Clear Map
          </Button>
          <Button
            onClick={() => {
              push({ query: { ...query, mapUrl: url } });
            }}
          >
            Set Map
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
