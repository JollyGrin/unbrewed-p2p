import { MapData, useLocalMapStorage } from "@/lib/hooks";
import {
  Image,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  Grid,
  VStack,
  Text,
  Divider,
  Box,
  Skeleton,
} from "@chakra-ui/react";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import DEFAULT_MAPS from "./defaultMaps.json";
import Link from "next/link";

export const MapModal = () => {
  const { query, push } = useRouter();
  const queryUrl = query.mapUrl as string | undefined;
  const { data } = useLocalMapStorage();
  const [loaded, setLoaded] = useState(false);

  // Reset to the loading state whenever a different map is selected so we never
  // flash the previously-selected map while the new image is still fetching.
  useEffect(() => setLoaded(false), [queryUrl]);

  const selectedMap = [...data, ...DEFAULT_MAPS].find(
    (map) => map.imgUrl === queryUrl,
  );

  return (
    <Modal
      isOpen={!!(query.editMapUrl as string | undefined)}
      onClose={() => {
        const { editMapUrl, ...rest } = query;
        push({ query: { ...rest } });
      }}
    >
      <ModalOverlay />
      <ModalContent minW="80vw">
        <ModalHeader>Browse your saved Maps</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Grid
            templateColumns={{ base: "1fr", md: "220px minmax(0, 1fr)" }}
            gap="1rem"
          >
            <VStack alignItems="start" overflowY="auto" maxH="72vh">
              {data?.map((map) => (
                <MapTitle
                  key={map.imgUrl}
                  map={map}
                  onClick={() =>
                    push({ query: { ...query, mapUrl: map.imgUrl } })
                  }
                />
              ))}
              <Divider />
              <Text fontWeight={700} fontSize="0.75rem" opacity={0.35}>
                Default Maps
              </Text>
              {DEFAULT_MAPS?.map((map) => (
                <MapTitle
                  key={map.imgUrl}
                  map={map}
                  onClick={() =>
                    push({ query: { ...query, mapUrl: map.imgUrl } })
                  }
                />
              ))}
            </VStack>
            <Box position="relative" minW={0}>
              <Box
                as={Link}
                href={selectedMap?.meta?.url ?? ""}
                zIndex={1}
                target="_blank"
                opacity={0.8}
                position="absolute"
                top="0"
                left="0"
                bg="brand.secondary"
                color="brand.primary"
                p="1rem"
                borderRadius="0 0 1rem 0"
              >
                <Text fontSize="1.5rem" fontWeight={700}>
                  {selectedMap?.meta?.title}
                </Text>
                {selectedMap?.meta?.author && (
                  <Text>by {selectedMap?.meta?.author}</Text>
                )}
              </Box>
              <Box
                position="relative"
                w="100%"
                minH="300px"
                display="flex"
                alignItems="center"
                justifyContent="center"
              >
                {queryUrl && !loaded && (
                  <Skeleton
                    position="absolute"
                    inset="0"
                    borderRadius="1rem"
                  />
                )}
                <Image
                  key={queryUrl}
                  src={queryUrl}
                  alt="mappreview"
                  borderRadius="1rem"
                  w="100%"
                  maxH="72vh"
                  objectFit="contain"
                  opacity={loaded ? 1 : 0}
                  transition="opacity 0.2s ease-in"
                  onLoad={() => setLoaded(true)}
                  onError={() => setLoaded(true)}
                />
              </Box>
            </Box>
          </Grid>
        </ModalBody>

        <ModalFooter></ModalFooter>
      </ModalContent>
    </Modal>
  );
};

const MapTitle = (props: { map: MapData; onClick: () => void }) => {
  return (
    <Text
      key={props.map.imgUrl}
      cursor="pointer"
      fontWeight="bold"
      transition="all 0.25s ease-in-out"
      _hover={{
        transform: "translateX(5px)",
      }}
      onClick={props.onClick}
    >
      {props.map.meta?.title}
    </Text>
  );
};
