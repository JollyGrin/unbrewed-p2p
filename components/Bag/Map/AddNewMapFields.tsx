import { MapData, useLocalMapStorage } from "@/lib/hooks";
import { Box, Button, FormLabel, HStack, Input, Fade, Text } from "@chakra-ui/react";
import { Dispatch, SetStateAction } from "react";
import { toast } from "react-hot-toast";

export const AddNewFields = ({
  newMap,
  enterMapUrl,
  setNewMap,
}: {
  newMap?: MapData;
  enterMapUrl: (value: string) => void;
  setNewMap: Dispatch<SetStateAction<MapData | undefined>>;
}) => {
  const { add } = useLocalMapStorage();
  return (
    <Box p="1rem" color="brand.primary">
      <FormLabel fontFamily="SpaceGrotesk" fontWeight={700} mb="0.15rem">
        Add a map
      </FormLabel>
      <Text fontSize="0.78rem" opacity={0.8} mb="0.5rem">
        Paste an image URL, give it a title, and it&apos;s added to your bag.
      </Text>
      <HStack>
        <Input
          bg="white"
          color="brand.secondary"
          value={newMap?.imgUrl}
          onChange={(e) => enterMapUrl(e.target.value)}
          placeholder="https://i.imgur.com/image.png"
          maxW="300px"
        />
        <Button
          bg="brand.accent"
          color="brand.surfaceDim"
          _hover={{ bg: "brand.accentDeep" }}
          isDisabled={!newMap || !newMap.meta?.title}
          onClick={() => {
            add(newMap as MapData);
            setNewMap(undefined);
            toast.success(`${newMap?.meta?.title ?? "Map"} added to your bag`);
          }}
        >
          Add map
        </Button>
      </HStack>
      <Fade in={!!newMap?.imgUrl}>
        {!!newMap?.imgUrl && (
          <Box maxW="500px">
            <Input
              bg="white"
              color="brand.secondary"
              borderColor={newMap.meta?.title ? "white" : "brand.danger"}
              my="0.5rem"
              maxW="500px"
              placeholder="Map title (required)"
              onChange={(e) =>
                setNewMap((prev) => ({
                  ...prev,
                  imgUrl: prev?.imgUrl ?? "",
                  meta: {
                    ...prev?.meta,
                    author: prev?.meta?.author,
                    title: e.target.value,
                  },
                }))
              }
            />

            <Input
              bg="white"
              color="brand.secondary"
              my="0.5rem"
              placeholder="Author (optional)"
              onChange={(e) =>
                setNewMap((prev) => ({
                  ...prev,
                  imgUrl: prev?.imgUrl ?? "",
                  meta: {
                    ...prev?.meta,
                    author: e.target.value,
                    title: prev?.meta?.title ?? "",
                  },
                }))
              }
            />

            <Input
              bg="white"
              color="brand.secondary"
              my="0.5rem"
              maxW="500px"
              placeholder="Source URL (optional) — e.g. the reddit post"
              onChange={(e) =>
                setNewMap((prev) => ({
                  ...prev,
                  imgUrl: prev?.imgUrl ?? "",
                  meta: {
                    ...prev?.meta,
                    author: prev?.meta?.author,
                    title: prev?.meta?.title ?? "",
                    url: e.target.value,
                  },
                }))
              }
            />
          </Box>
        )}
      </Fade>
    </Box>
  );
};
