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
          minW="1.3rem"
          fontSize="0.7rem"
          h="1.3rem"
          borderRadius="10rem"
          transform="rotate(90deg)"
          bg="brand.primary"
          color="brand.surfaceDim"
          boxShadow="0 1px 3px rgba(20, 8, 24, 0.4)"
          _hover={{ bg: "brand.highlight" }}
        >
          <IconKebab />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        fontSize="0.7rem"
        w="fit-content"
        maxW="180px"
        bg="brand.parchment"
        border="1px solid rgba(72, 40, 79, 0.35)"
        boxShadow="0 8px 20px rgba(20, 8, 24, 0.45)"
      >
        <PopoverArrow bg="brand.parchment" />
        <PopoverHeader
          py="0.25rem"
          textTransform="uppercase"
          fontWeight={700}
          fontFamily="SpaceGrotesk"
          letterSpacing="0.04em"
          border="none"
        >
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
