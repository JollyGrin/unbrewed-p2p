import { MapData } from "@/lib/hooks";
import { useBagMaps } from "@/lib/bag/useBag";
import {
  Text,
  Box,
  Flex,
  Grid,
  HStack,
  Image,
  Skeleton,
  Tag,
  Tooltip,
} from "@chakra-ui/react";
import { BagSourceChip, ShareItemCorner } from "@/components/Bag/Account";
import { useState } from "react";
import { AddNewFields } from "./AddNewMapFields";
import { CloseIcon } from "@chakra-ui/icons";
import { useRouter } from "next/router";
import { MapCard } from "./MapCard";
import { MapModal } from "./MapModal";
import DEFAULT_MAPS from "./MapModal/defaultMaps.json";
import { toast } from "react-hot-toast";

export const BagMap = () => {
  const { query, push } = useRouter();
  const { data, remove, sourceOf, cloudIdOf } = useBagMaps();
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
    <Box bg="brand.primary" h="100%" overflowY="auto">
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
      <Flex
        px="0.75rem"
        pt="0.9rem"
        pb="0.1rem"
        align="baseline"
        justify="space-between"
        flexWrap="wrap"
        gap="0.5rem"
      >
        <Text
          fontFamily="SpaceGrotesk"
          fontWeight={700}
          fontSize="1.05rem"
          color="brand.secondary"
        >
          Maps
        </Text>
        <Text fontSize="0.82rem" opacity={0.8} color="brand.secondary">
          Click a map to use it in your next game.
        </Text>
      </Flex>
      <Flex flexWrap="wrap" gap="0.5rem" p="0.75rem">
        {[...data, ...(DEFAULT_MAPS as MapData[])]?.map((map) => {
          const isCustom = data.some((m) => m.imgUrl === map.imgUrl);
          const isSelected = selectedUrl === map.imgUrl;
          return (
            <MapCard
              key={map?.imgUrl}
              map={map}
              w="250px"
              h="200px"
              isSelected={isSelected}
              onSelect={() => selectMap(map)}
              badge={isSelected ? "Selected" : undefined}
              corner={
                isCustom ? (
                  <HStack spacing="0.25rem">
                    <BagSourceChip source={sourceOf(map.imgUrl)} />
                    {/*
                      A share link exists only for a map that lives in the
                      account (#644) — a device map has no row to link to, so a
                      guest's card carries exactly the controls it always did.
                    */}
                    <ShareItemCorner
                      kind="maps"
                      cloudId={cloudIdOf(map.imgUrl)}
                    />
                    <Tooltip label="Remove this map from your bag">
                      <Flex
                        bg="rgba(20, 8, 24, 0.6)"
                        borderRadius="100%"
                        p="0.35rem"
                        color="#FAEBD7"
                        cursor="pointer"
                        _hover={{ bg: "brand.danger" }}
                        onClick={async (e) => {
                          e.stopPropagation();
                          await remove(map.imgUrl);
                          toast.success("Map removed");
                        }}
                      >
                        <CloseIcon boxSize="0.6rem" />
                      </Flex>
                    </Tooltip>
                  </HStack>
                ) : (
                  <Tag size="sm" bg="rgba(20, 8, 24, 0.6)" color="#FAEBD7">
                    built-in
                  </Tag>
                )
              }
            />
          );
        })}
      </Flex>

      <MapModal />
    </Box>
  );
};
