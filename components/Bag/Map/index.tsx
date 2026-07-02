import { MapData, useLocalMapStorage } from "@/lib/hooks";
import {
  Text,
  Box,
  Flex,
  Grid,
  Image,
  Skeleton,
  Tag,
  Tooltip,
} from "@chakra-ui/react";
import { useState } from "react";
import { AddNewFields } from "./AddNewMapFields";
import { CloseIcon, LinkIcon } from "@chakra-ui/icons";
import Link from "next/link";
import { useRouter } from "next/router";
import { MapModal } from "./MapModal";
import DEFAULT_MAPS from "./MapModal/defaultMaps.json";
import { toast } from "react-hot-toast";

export const BagMap = () => {
  const { query, push } = useRouter();
  const { data, remove } = useLocalMapStorage();
  const [newMap, setNewMap] = useState<MapData>();

  function enterMapUrl(value?: string) {
    if (!value) return setNewMap(undefined);
    return setNewMap((prev) => ({
      ...(prev ?? {}),
      imgUrl: value,
    }));
  }

  const selectedUrl = query?.mapUrl as string | undefined;

  const selectMap = (map: MapData) => {
    push({
      query: { ...query, mapUrl: map.imgUrl, editMapUrl: true },
    });
    toast.success(`${map.meta?.title ?? "Map"} selected for your next game`);
  };

  return (
    <Box bg="brand.primary" minH="100%">
      <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} bg="brand.secondary">
        <AddNewFields {...{ newMap, enterMapUrl, setNewMap }} />
        {newMap?.imgUrl ? (
          <Image
            alt="map-preview"
            src={newMap?.imgUrl}
            maxH="14rem"
            objectFit="contain"
            justifySelf="center"
            my="0.5rem"
          />
        ) : (
          <Skeleton w="300px" h="5rem" mt="0.5rem" />
        )}
      </Grid>
      <Text px="0.75rem" pt="0.75rem" fontSize="0.85rem" opacity={0.8}>
        Click a map to use it in your next game.
      </Text>
      <Flex flexWrap="wrap" gap="0.5rem" p="0.75rem">
        {[...data, ...(DEFAULT_MAPS as MapData[])]?.map((map) => {
          const isCustom = data.some((m) => m.imgUrl === map.imgUrl);
          const isSelected = selectedUrl === map.imgUrl;
          return (
            <Box
              key={map?.imgUrl}
              w="250px"
              h="200px"
              bg="brand.highlight"
              bgImg={map?.imgUrl}
              bgPos="center"
              bgSize="cover"
              borderRadius="0.5rem"
              border="3px solid"
              borderColor={isSelected ? "gold" : "transparent"}
              boxShadow="0 2px 8px rgba(20, 8, 24, 0.3)"
              position="relative"
              cursor="pointer"
              transition="transform 0.15s ease-out"
              _hover={{ transform: "translateY(-2px)" }}
              onClick={() => selectMap(map)}
            >
              <Flex
                position="absolute"
                bottom="0"
                w="100%"
                p="0.35rem 0.5rem"
                bg="linear-gradient(180deg, rgba(20,8,24,0) 0%, rgba(20,8,24,0.85) 100%)"
                borderBottomRadius="0.35rem"
                justifyContent="space-between"
                alignItems="end"
                color="#FAEBD7"
              >
                <Box>
                  <Text fontWeight={700} fontSize="0.85rem" lineHeight={1.2}>
                    {map?.meta?.title ?? "Untitled map"}
                  </Text>
                  {map?.meta?.author && (
                    <Text fontSize="0.7rem" opacity={0.8}>
                      by {map.meta.author}
                    </Text>
                  )}
                </Box>
                {map?.meta?.url && (
                  <Link
                    href={map.meta.url}
                    target="_blank"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <LinkIcon />
                  </Link>
                )}
              </Flex>

              {isSelected && (
                <Tag
                  position="absolute"
                  top="0.35rem"
                  left="0.35rem"
                  size="sm"
                  bg="gold"
                >
                  Selected
                </Tag>
              )}

              {isCustom ? (
                <Tooltip label="Remove this map from your bag">
                  <Flex
                    position="absolute"
                    top="0.35rem"
                    right="0.35rem"
                    bg="rgba(20, 8, 24, 0.6)"
                    borderRadius="100%"
                    p="0.35rem"
                    color="#FAEBD7"
                    _hover={{ bg: "brand.danger" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(map.imgUrl);
                      toast.success("Map removed");
                    }}
                  >
                    <CloseIcon boxSize="0.6rem" />
                  </Flex>
                </Tooltip>
              ) : (
                <Tag
                  position="absolute"
                  top="0.35rem"
                  right="0.35rem"
                  size="sm"
                  bg="rgba(20, 8, 24, 0.6)"
                  color="#FAEBD7"
                >
                  built-in
                </Tag>
              )}
            </Box>
          );
        })}
      </Flex>

      <MapModal />
    </Box>
  );
};
