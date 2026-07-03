import { MapModal as MapSelectorModal } from "@/components/Bag/Map/MapModal";
import DEFAULT_MAPS from "@/components/Bag/Map/MapModal/defaultMaps.json";
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
  Box,
} from "@chakra-ui/react";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useDebounce } from "use-debounce";

export const MapModal = (props: { isOpen: boolean; onClose: () => void }) => {
  const { query, push } = useRouter();
  const [_url, setUrl] = useState(query.mapUrl as string | undefined);
  const [url] = useDebounce(_url, 300);
  const [loaded, setLoaded] = useState(false);

  // Show the loading skeleton again each time the previewed URL changes so the
  // prior map image doesn't linger while the new one loads.
  useEffect(() => setLoaded(false), [url]);

  return (
    <>
      <MapSelectorModal />
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
              Changing the map updates it for everyone in the game.
            </Text>
            <Text mt="4px" fontSize="0.75rem">
              Recommended 1200x1000
            </Text>
            {!url && <Skeleton h="250px" w="300px" borderRadius="0.5rem" />}
            {url && (
              <Box position="relative" h="250px" mt="0.5rem">
                {!loaded && (
                  <Skeleton
                    position="absolute"
                    inset="0"
                    borderRadius="0.5rem"
                  />
                )}
                <Image
                  key={url}
                  alt="map"
                  src={url}
                  h="250px"
                  opacity={loaded ? 1 : 0}
                  transition="opacity 0.2s ease-in"
                  onLoad={() => setLoaded(true)}
                  onError={() => setLoaded(true)}
                />
              </Box>
            )}
          </ModalBody>

          <ModalFooter gap="1rem">
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
                const defaultMapUrl = query?.mapUrl ?? DEFAULT_MAPS[0].imgUrl;
                push({
                  query: { ...query, editMapUrl: true, mapUrl: defaultMapUrl },
                });
              }}
            >
              Browse saved maps
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
    </>
  );
};
