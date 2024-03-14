import { MapData } from "@/lib/hooks";
import {
  Text,
  Box,
  Button,
  FormLabel,
  HStack,
  Input,
  Slide,
  Fade,
  Grid,
} from "@chakra-ui/react";
import { useState } from "react";

export const BagMap = () => {
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
      <Box p="1rem" bg="brand.secondary" color="brand.primary">
        <FormLabel>Add new map</FormLabel>
        <HStack>
          <Input
            value={newMap?.imgUrl}
            onChange={(e) => enterMapUrl(e.target.value)}
            placeholder="https://i.imgur.com/image.png"
            maxW="300px"
          />
          <Button>Add map</Button>
        </HStack>
        <Fade in={!!newMap?.imgUrl}>
          {!!newMap?.imgUrl && (
            <Box maxW="500px">
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
                maxW="500px"
                placeholder="https://www.reddit.com/r/Unmatched/comments/1alrt42/forest_castle_custom_map/"
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
    </Box>
  );
};
