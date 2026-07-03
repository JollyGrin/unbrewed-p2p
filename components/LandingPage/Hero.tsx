import { IconLogoTextmark } from "@/components/Icons/IconLogoTextmark";
import { Navbar } from "@/components/Navbar";
import {
  Box,
  Button,
  Flex,
  HStack,
  SlideFade,
  Text,
  VisuallyHidden,
  VStack,
} from "@chakra-ui/react";
import Link from "next/link";
import { DiscordPresence } from "@/components/Discord";

export const Hero = () => {
  return (
    <Flex
      direction="column"
      minH="42vh"
      bg="brand.secondary"
      color="brand.primary"
      position="relative"
      overflow="hidden"
    >
      {/* subtle parchment glow behind the wordmark */}
      <Box
        position="absolute"
        top="55%"
        left="50%"
        transform="translate(-50%, -50%)"
        w="min(90vw, 700px)"
        h="min(90vw, 700px)"
        bgGradient="radial(brand.primary, transparent 65%)"
        opacity={0.08}
        pointerEvents="none"
      />
      <Navbar />
      <VisuallyHidden>
        <h1>
          Unbrewed — play Unmatched fan decks online in your browser
        </h1>
      </VisuallyHidden>
      <SlideFade in offsetY="16px">
        <VStack
          flexGrow="1"
          justifyContent="center"
          alignItems="center"
          gap="0.75rem"
          py="2rem"
        >
          <Text
            opacity={0.6}
            fontFamily="ArchivoNarrow"
            letterSpacing="0.08em"
            textTransform="uppercase"
            fontSize="0.85rem"
          >
            an unofficial Unmatched homebrew simulator
          </Text>
          <IconLogoTextmark height="7em" width="auto" />
          <Text maxW="34rem" textAlign="center" opacity={0.75} px="1rem">
            Build homebrew decks, drop them on any map, and play head-to-head
            with a friend — right in your browser.
          </Text>
          <HStack color="brand.primary" mt="0.75rem" flexWrap="wrap" justify="center">
            <Button
              variant="outline"
              color="inherit"
              borderColor="brand.primary"
              _hover={{ bg: "brand.primary", color: "brand.secondary" }}
              as={Link}
              href="/bag"
            >
              Add your decks
            </Button>

            <Button
              color="brand.secondary"
              bg="brand.primary"
              borderColor="brand.primary"
              _hover={{ bg: "brand.highlight", transform: "translateY(-2px)" }}
              transition="all 0.2s ease"
              as={Link}
              href="/connect"
            >
              Connect &amp; Play
            </Button>
          </HStack>
          <DiscordPresence tone="light" mt="0.5rem" />
          <Text
            as={Link}
            href="#get-started"
            mt="0.5rem"
            fontSize="0.8rem"
            opacity={0.55}
            _hover={{ opacity: 0.9 }}
            transition="opacity 0.2s ease"
          >
            New here? See how to get started ↓
          </Text>
        </VStack>
      </SlideFade>
    </Flex>
  );
};
