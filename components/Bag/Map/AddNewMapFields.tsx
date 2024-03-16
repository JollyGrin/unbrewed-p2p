import { MapData, useLocalMapStorage } from "@/lib/hooks";
import { Box, Button, FormLabel, HStack, Input, Fade } from "@chakra-ui/react";
import { useRouter } from "next/router";
import { Dispatch, SetStateAction } from "react";

export const AddNewFields = ({
  newMap,
  enterMapUrl,
  setNewMap,
}: {
  newMap?: MapData;
  enterMapUrl: (value: string) => void;
  setNewMap: Dispatch<SetStateAction<MapData | undefined>>;
}) => {
  const { reload } = useRouter();
  const { add } = useLocalMapStorage();
  return (
    <Box p="1rem" color="brand.primary">
      <FormLabel>Add new map</FormLabel>
      <HStack>
        <Input
          value={newMap?.imgUrl}
          onChange={(e) => enterMapUrl(e.target.value)}
          placeholder="https://i.imgur.com/image.png"
          maxW="300px"
        />
        <Button
          isDisabled={!newMap || !newMap.meta?.title}
          onClick={() => {
            add(newMap as MapData);
            setNewMap(undefined);
            reload();
          }}
        >
          Add map
        </Button>
      </HStack>
      <Fade in={!!newMap?.imgUrl}>
        {!!newMap?.imgUrl && (
          <Box maxW="500px">
            <Input
              borderColor={newMap.meta?.title ? "white" : "tomato"}
              my="0.5rem"
              maxW="500px"
              placeholder="Map title"
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
              my="0.5rem"
              placeholder="Author"
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
              my="0.5rem"
              maxW="500px"
              placeholder="Source URL https://www.reddit.com/r/Unmatched/comments/1alrt42/forest_castle_custom_map/"
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
