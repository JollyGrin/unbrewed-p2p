import { Box, Flex, SimpleGrid, Text } from "@chakra-ui/react";
import Link from "next/link";
import { Chip, Eyebrow, H2, Section } from "./ui";
import { TABLES, TableCard } from "./content";

/** Every still is captured at 16:10, 1280×800 (public/landing). */
const THUMB_W = 1280;
const THUMB_H = 800;

/** IRL mode has no screen worth a still: a drawn phone holding a hand. */
const PhoneArt = () => (
  <Flex
    aria-hidden="true"
    position="absolute"
    inset="0"
    align="center"
    justify="center"
    bg="radial-gradient(ellipse at 50% 120%, #5A3F60, #2C1831 70%)"
  >
    <Box
      w="5.75rem"
      h="9.4rem"
      borderRadius="1rem"
      border="3px solid"
      borderColor="brand.primary"
      bg="brand.surfaceDim"
      px="0.5rem"
      py="0.6rem"
      display="grid"
      gridTemplateRows="auto 1fr auto"
      gap="0.4rem"
      transform="rotate(-6deg)"
    >
      <Flex justify="space-between" fontSize="0.6rem" fontWeight={700} color="brand.primary">
        <span>♥</span>
        <span>♥</span>
      </Flex>
      <Flex gap="3px" align="flex-end" justify="center">
        {["1.5rem", "1.75rem", "1.5rem", "1.5rem"].map((h, i) => (
          <Box key={i} w="1rem" h={h} borderRadius="3px" bg={i === 1 ? "brand.accent" : "brand.primary"} opacity={0.9} />
        ))}
      </Flex>
      <Box h="0.5rem" borderRadius="3px" bg="#5A3F60" />
    </Box>
  </Flex>
);

const TableTile = ({ table }: { table: TableCard }) => (
  <Box
    as={Link}
    href={table.href}
    display="grid"
    gridTemplateRows="auto 1fr"
    bg="brand.secondary"
    color="brand.highlight"
    borderRadius="0.9rem"
    overflow="hidden"
    boxShadow="0 10px 24px -12px rgba(44,24,49,.45)"
    minW={0}
    transition="transform .2s, box-shadow .2s"
    _hover={{ transform: "translateY(-4px)", boxShadow: "0 22px 34px -16px rgba(44,24,49,.6)" }}
    _focusVisible={{ outline: "3px solid", outlineColor: "brand.accent", outlineOffset: "3px" }}
    sx={{ "@media (prefers-reduced-motion: reduce)": { transition: "none", "&:hover": { transform: "none" } } }}
  >
    <Box position="relative" sx={{ aspectRatio: "16 / 10" }} bg="brand.surfaceDim" overflow="hidden">
      {table.image ? (
        // Plain <img>: the site is a static export (no next/image optimizer).
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={table.image.src}
          alt={table.image.alt}
          width={THUMB_W}
          height={THUMB_H}
          loading="lazy"
          decoding="async"
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : (
        <PhoneArt />
      )}
      <Text
        as="span"
        position="absolute"
        top="0.6rem"
        left="0.6rem"
        fontFamily="SpaceGrotesk"
        fontSize="0.7rem"
        fontWeight={700}
        letterSpacing="0.1em"
        textTransform="uppercase"
        px="0.5rem"
        py="0.25rem"
        borderRadius="0.4rem"
        bg={table.tagStrong ? "brand.accent" : "rgba(44,24,49,.78)"}
        color={table.tagStrong ? "brand.surfaceDim" : "brand.primary"}
      >
        {table.tag}
      </Text>
    </Box>
    <Flex direction="column" gap="0.6rem" p="1.1rem">
      <Text as="h3" fontFamily="SpaceGrotesk" fontWeight={700} fontSize="1.35rem" color="brand.parchment">
        {table.name}
      </Text>
      <Text fontSize="0.85rem" color="brand.accent" fontWeight={600}>
        {table.best}
      </Text>
      <Text fontSize="0.92rem" opacity={0.92}>
        {table.text}
      </Text>
      <Flex wrap="wrap" gap="0.35rem">
        {table.chips.map((chip) => (
          <Chip key={chip} borderColor="rgba(241,224,193,.25)" color="brand.primary">
            {chip}
          </Chip>
        ))}
      </Flex>
      <Text mt="auto" pt="0.3rem" fontFamily="SpaceGrotesk" fontWeight={700} color="brand.parchment">
        {table.cta} →
      </Text>
    </Flex>
  </Box>
);

/** Section 3: the four tables, equal weight, each a real link to its route. */
export const FourTables = () => (
  <Section id="ways" bg="brand.highlight">
    <Flex wrap="wrap" align="flex-end" justify="space-between" gap="0.75rem" mb="1.75rem">
      <Box>
        <Eyebrow>Four ways to play</Eyebrow>
        <H2 id="ways">Same decks. Four tables.</H2>
      </Box>
      <Text
        as={Link}
        href="#helper"
        fontFamily="SpaceGrotesk"
        fontWeight={700}
        fontSize="0.9rem"
        border="1.5px solid"
        borderRadius="0.5rem"
        px="0.8rem"
        py="0.45rem"
        _hover={{ bg: "brand.secondary", color: "brand.highlight", borderColor: "brand.secondary" }}
      >
        Not sure? Let us pick ↓
      </Text>
    </Flex>
    <SimpleGrid columns={{ base: 1, md: 2 }} spacing="1.1rem">
      {TABLES.map((table) => (
        <TableTile key={table.id} table={table} />
      ))}
    </SimpleGrid>
  </Section>
);
