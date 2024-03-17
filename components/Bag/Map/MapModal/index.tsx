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
} from "@chakra-ui/react";
import { useRouter } from "next/router";
import { DEFAULT_MAPS } from "./defaultMaps";
import Link from "next/link";

export const MapModal = () => {
  const { query, push } = useRouter();
  const queryUrl = query.mapUrl as string | undefined;
  const { data } = useLocalMapStorage();

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
          <Grid templateColumns="1fr 5fr">
            <VStack alignItems="start">
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
            <Box position="relative">
              <Box
                as={Link}
                href={selectedMap?.meta?.url ?? ""}
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
              <Image
                src={queryUrl}
                alt="mappreview"
                borderRadius="1rem"
                w="100%"
              />
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
