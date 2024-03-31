import {
  Box,
  Text,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverHeader,
  PopoverBody,
  PopoverArrow,
  Button,
} from "@chakra-ui/react";

import { CiMenuKebab as IconKebab } from "react-icons/ci";

export const PopoverCardActions = (props: {
  actions: { text: string; fn: () => void }[];
}) => {
  return (
    <Popover>
      <PopoverTrigger>
        <Button
          p="0"
          m="0"
          minW="1rem"
          fontSize="0.5rem"
          h="1rem"
          transform="translateY(-6px) translateX(-10px) rotate(90deg)"
          bg="antiquewhite"
        >
          <IconKebab />
        </Button>
      </PopoverTrigger>
      <PopoverContent fontSize="0.35rem" w="fit-content" maxW="100px">
        <PopoverArrow />
        <PopoverHeader py="0.25rem" textTransform="uppercase" fontWeight={700}>
          Card Actions
        </PopoverHeader>
        <PopoverBody p="0.25rem">
          {props?.actions?.map((action) => (
            <Action key={action.text} {...action} />
          ))}
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
};

const Action = (props: { text: string; fn: () => void }) => {
  return (
    <Box
      _hover={{ bg: "brand.primary" }}
      p="0.1rem 0.25rem"
      borderRadius="2px"
      transition="all 0.25s ease-in-out"
      onClick={props.fn}
    >
      <Text>{props.text}</Text>
    </Box>
  );
};
