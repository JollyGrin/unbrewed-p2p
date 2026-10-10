import { useState } from "react";
import { Box, Button, Flex, Text } from "@chakra-ui/react";
import Link from "next/link";
import { H2, Section } from "./ui";
import { INTENTS } from "./content";

/**
 * Section 4, "I want to…": six intents, one recommendation card. Toggle
 * buttons (aria-pressed) swap the card; the card's link goes straight to the
 * table that fits.
 */
export const IntentHelper = () => {
  const [key, setKey] = useState(INTENTS[0].key);
  const intent = INTENTS.find((i) => i.key === key) ?? INTENTS[0];

  return (
    <Section id="helper" py={{ base: "3rem", md: "3.5rem" }}>
      <Box
        bg="#FFF6E8"
        border="1px solid rgba(72,40,79,.18)"
        borderRadius="1.1rem"
        p={{ base: "1.25rem", md: "1.75rem" }}
        boxShadow="0 10px 24px -12px rgba(44,24,49,.45)"
      >
        <H2 id="helper" mt={0} fontSize={{ base: "1.4rem", md: "1.6rem" }}>
          I want to…
        </H2>
        <Flex role="group" aria-label="What do you want to do?" wrap="wrap" gap="0.5rem" mt="1rem">
          {INTENTS.map((option) => {
            const pressed = option.key === key;
            return (
              <Button
                key={option.key}
                aria-pressed={pressed}
                onClick={() => setKey(option.key)}
                variant="unstyled"
                h="auto"
                whiteSpace="normal"
                fontFamily="SpaceGrotesk"
                fontWeight={600}
                fontSize="0.9rem"
                px="0.9rem"
                py="0.55rem"
                borderRadius="full"
                border="1.5px solid"
                borderColor={pressed ? "brand.secondary" : "rgba(72,40,79,.25)"}
                bg={pressed ? "brand.secondary" : "transparent"}
                color={pressed ? "brand.primary" : "brand.surfaceDim"}
                _hover={{ borderColor: "brand.secondary" }}
              >
                {option.label}
              </Button>
            );
          })}
        </Flex>
        <Flex
          aria-live="polite"
          mt="1.1rem"
          direction={{ base: "column", md: "row" }}
          align={{ md: "center" }}
          gap="1rem"
          p="1.1rem 1.25rem"
          borderRadius="0.75rem"
          bg="brand.highlight"
          borderLeft="5px solid"
          borderLeftColor="brand.accent"
        >
          <Box flex="1">
            <Text as="h3" fontFamily="SpaceGrotesk" fontWeight={700} fontSize="1.15rem">
              {intent.title}
            </Text>
            <Text mt="0.25rem" fontSize="0.95rem" opacity={0.85}>
              {intent.text}
            </Text>
          </Box>
          <Box
            as={Link}
            href={intent.href}
            alignSelf={{ base: "flex-start", md: "center" }}
            flexShrink={0}
            bg="brand.accent"
            color="brand.surfaceDim"
            fontFamily="SpaceGrotesk"
            fontWeight={700}
            px="1.1rem"
            py="0.7rem"
            borderRadius="0.6rem"
            _hover={{ bg: "brand.accentDeep" }}
          >
            {intent.cta}
          </Box>
        </Flex>
      </Box>
    </Section>
  );
};
