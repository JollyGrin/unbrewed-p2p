import { MapData, useLocalMapStorage } from "@/lib/hooks";
import { Text, Box, Flex, Grid, Image, HStack, Button } from "@chakra-ui/react";
import { useState } from "react";
import { AddNewFields } from "./AddNewMapFields";
import { LinkIcon } from "@chakra-ui/icons";
import Link from "next/link";

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
    <Box>
      <Grid templateColumns="1fr 1fr" bg="brand.secondary">
        <AddNewFields {...{ newMap, enterMapUrl, setNewMap }} />
        <Image alt="map-preview" src={newMap?.imgUrl} />
      </Grid>
      {data?.map((map) => {
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
              boxSize="10rem"
              bgImage={map.imgUrl}
              bgPosition="center"
              bgSize="cover"
              borderRightRadius="inherit"
            />
          </Flex>
        );
      })}
      <Button onClick={clear}>Clear all Maps</Button>
    </Box>
  );
};
