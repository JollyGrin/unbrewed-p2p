import { MapData, useLocalMapStorage } from "@/lib/hooks";
import {
  Text,
  Box,
  Flex,
  Grid,
  Image,
  HStack,
  Button,
  Skeleton,
} from "@chakra-ui/react";
import { useState } from "react";
import { AddNewFields } from "./AddNewMapFields";
import { LinkIcon } from "@chakra-ui/icons";
import Link from "next/link";
import { useRouter } from "next/router";
import { MapModal } from "./MapModal";
import { DEFAULT_MAPS } from "./MapModal/defaultMaps";

export const BagMap = () => {
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
      {data?.map((map) => <MapCard key={map.imgUrl} {...map} />)}
      <Button onClick={clear} ml="1rem">
        Clear your saved Maps
      </Button>

      <Text
        m="0 auto"
        w="fit-content"
        fontSize="2rem"
        fontFamily="SpaceGrotesk"
      >
        Default Homebrewed Maps
      </Text>
      {DEFAULT_MAPS?.map((map) => <MapCard key={map.imgUrl} {...map} />)}

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
