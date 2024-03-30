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
    <Box bg="brand.primary" h="100%">
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

      {/* {data?.map((map) => <MapCard key={map.imgUrl} {...map} />)} */}
      {/* <Button onClick={clear} ml="1rem"> */}
      {/*   Clear your saved Maps */}
      {/* </Button> */}

      {/* <Text */}
      {/*   m="0 auto" */}
      {/*   w="fit-content" */}
      {/*   fontSize="2rem" */}
      {/*   fontFamily="SpaceGrotesk" */}
      {/* > */}
      {/*   Default Homebrewed Maps */}
      {/* </Text> */}
      {/* {DEFAULT_MAPS?.map((map) => <MapCard key={map.imgUrl} {...map} />)} */}

      <MapModal />
    </Box>
  );
};

const MapCard = (map: MapData) => {
  const { query, push } = useRouter();
  return (
    <Flex
      maxW="500px"
      m="1rem auto"
      bg="brand.secondary"
      color="brand.primary"
      justifyContent="space-between"
      alignItems="center"
      borderRadius="0.5rem"
    >
      <HStack p="1rem">
        <Text fontSize="2rem">{map.meta?.title}</Text>
        {map.meta?.author && <Text>by {map.meta.author}</Text>}
        {map.meta?.url && (
          <Link href={map.meta.url}>
            <LinkIcon fontSize="2rem" />
          </Link>
        )}
      </HStack>
      <Box
        cursor="pointer"
        boxSize="10rem"
        bgImage={map.imgUrl}
        bgPosition="center"
        bgSize="cover"
        borderRightRadius="inherit"
        onClick={() => {
          push({ query: { ...query, mapUrl: map.imgUrl, editMapUrl: true } });
        }}
      />
    </Flex>
  );
};
