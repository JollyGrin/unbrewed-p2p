import { MapData, useLocalMapStorage } from "@/lib/hooks";
import {
  Text,
  Box,
  Flex,
  Grid,
  Image,
  HStack,
  Skeleton,
} from "@chakra-ui/react";
import { useState } from "react";
import { AddNewFields } from "./AddNewMapFields";
import { LinkIcon } from "@chakra-ui/icons";
import Link from "next/link";
import { useRouter } from "next/router";
import { MapModal } from "./MapModal";
import DEFAULT_MAPS from "./MapModal/defaultMaps.json";

export const BagMap = () => {
  const { query, push } = useRouter();
  const { data, clear } = useLocalMapStorage();
  const [newMap, setNewMap] = useState<MapData>();

  function enterMapUrl(value?: string) {
    if (!value) return setNewMap(undefined);
    return setNewMap((prev) => ({
      ...(prev ?? {}),
      imgUrl: value,
    }));
  }
  return (
    <Box bg="brand.primary">
      <Grid templateColumns="1fr 1fr" bg="brand.secondary">
        <AddNewFields {...{ newMap, enterMapUrl, setNewMap }} />
        {newMap?.imgUrl ? (
          <Image alt="map-preview" src={newMap?.imgUrl} />
        ) : (
          <Skeleton w="300px" h="5rem" mt="0.5rem" />
        )}
      </Grid>
      <Flex flexWrap="wrap" gap="0.5rem" p="0.5rem">
        {[...data, ...DEFAULT_MAPS]?.map((map) => (
          <Box
            key={map?.imgUrl}
            minW="250px"
            minH="200px"
            bg="brand.highlight"
            bgImg={map?.imgUrl}
            bgPos="center"
            bgSize="cover"
            borderRadius="0.5rem"
            position="relative"
            onClick={() => {
              push({
                query: { ...query, mapUrl: map.imgUrl, editMapUrl: true },
              });
            }}
          >
            <Text
              position="absolute"
              bg="rgba(255,255,255,0.7)"
              p="0.25rem"
              borderRadius="0.5rem 0 0.25rem 0"
            >
              {map?.meta?.author}
            </Text>

            {map?.meta?.url && (
              <Box
                position="absolute"
                bottom="0"
                bg="rgba(255,255,255,0.7)"
                p="0.25rem"
              >
                <Link href={map?.meta?.url}>
                  <LinkIcon fontSize="2rem" />
                </Link>
              </Box>
            )}
          </Box>
        ))}
      </Flex>

      <MapModal />
    </Box>
  );
};
