import { IconLogoTextmark } from "@/components/Icons/IconLogoTextmark";
import { Navbar } from "@/components/Navbar";
import { Button, Flex, HStack, Text, VStack } from "@chakra-ui/react";
import Link from "next/link";

export const Hero = () => {
  return (
    <Flex
      direction="column"
      minH="35vh"
      bg="brand.secondary"
      color="brand.primary"
    >
      <Navbar />
      <VStack
        flexGrow="1"
        justifySelf="center"
        alignItems="center"
        justifyContent="center"
        gap="1rem"
      >
        <Text opacity={0.5}>an unofficial Unmatched homebrew simulator</Text>
        <IconLogoTextmark height="7em" width="auto" />
        <HStack color="brand.primary" mt="0.5rem">
          <Button
            variant="outline"
            color="inherit"
            borderColor="brand.primary"
            _hover={{ bg: "brand.secondary", color: "brand.highlight" }}
            as={Link}
            href="/bag"
          >
            Add your decks
          </Button>

          <Button
            color="brand.secondary"
            bg="brand.primary"
            borderColor="brand.primary"
            _hover={{ bg: "brand.highlight" }}
            as={Link}
            href="/connect"
          >
            Connect & Play
          </Button>
        </HStack>
      </VStack>
    </Flex>
  );
};
