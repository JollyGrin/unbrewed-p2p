import { Box, Flex, Grid, SimpleGrid, Text } from "@chakra-ui/react";
import Link from "next/link";
import { Chip, Eyebrow, GOLD_INK, H2, Section } from "./ui";
import { IMPORT_SOURCES } from "./content";
import type { ShowcaseMap } from "./catalog";

/** Section 7: import sources, map thumbnails, and the 2D-or-3D pick. */
export const BringAnyDeck = ({
  showcaseMaps,
  sandboxMapCount,
}: {
  showcaseMaps: ShowcaseMap[];
  sandboxMapCount: number;
}) => (
  <Section id="decks" bg="brand.highlight">
    <Eyebrow>Bring any deck</Eyebrow>
    <H2 id="decks">Bring your own everything.</H2>
    <Text mt="0.75rem" maxW="62ch" fontSize="1.05rem" opacity={0.85}>
      Starter decks get you playing in a minute, but the sandbox, the 3D table and IRL mode are built for the
      decks and maps you make yourself — no conversion: paste a link, name a lobby, send the invite.
    </Text>
    <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap="1.75rem" mt="1.75rem" alignItems="start">
      <Box minW={0}>
        <Grid as="ul" listStyleType="none" m={0} p={0} gap="0.5rem">
          {IMPORT_SOURCES.map((source) => (
            <Grid
              as="li"
              key={source.key}
              templateColumns="3.5rem 1fr"
              gap="0.75rem"
              alignItems="center"
              bg="#FFF6E8"
              border="1px solid rgba(72,40,79,.18)"
              borderRadius="0.6rem"
              px="0.85rem"
              py="0.7rem"
              minW={0}
            >
              <Text fontFamily="SpaceGrotesk" fontWeight={700} fontSize="0.68rem" letterSpacing="0.08em" textTransform="uppercase" color={GOLD_INK}>
                {source.key}
              </Text>
              <Box minW={0}>
                <Text fontFamily="SpaceGrotesk" fontWeight={700}>
                  {source.name}
                </Text>
                <Text fontSize="0.85rem" opacity={0.8}>
                  {source.text}
                </Text>
              </Box>
            </Grid>
          ))}
        </Grid>
        <SimpleGrid columns={2} spacing="0.6rem" mt="0.9rem">
          {[
            { href: "/connect", title: "2D table", text: "Map, hand, dice, tokens. The classic." },
            { href: "/table", title: "3D table", text: "Same decks on a 3D table, with minis." },
          ].map((pick) => (
            <Flex
              key={pick.href}
              as={Link}
              href={pick.href}
              direction="column"
              gap="0.2rem"
              p="0.9rem"
              borderRadius="0.6rem"
              bg="brand.secondary"
              color="brand.highlight"
              fontSize="0.85rem"
              _hover={{ bg: "brand.surface" }}
            >
              <Text fontFamily="SpaceGrotesk" fontWeight={700} fontSize="1rem" color="brand.parchment">
                {pick.title}
              </Text>
              {pick.text}
            </Flex>
          ))}
        </SimpleGrid>
        <Box as={Link} href="/bag" display="inline-block" mt="1rem" fontFamily="SpaceGrotesk" fontWeight={700} textDecoration="underline">
          Open your bag →
        </Box>
      </Box>

      <Box minW={0}>
        <SimpleGrid columns={2} spacing="0.6rem">
          {showcaseMaps.map((map) => (
            <Box
              as="figure"
              key={map.thumbUrl}
              m={0}
              position="relative"
              borderRadius="0.6rem"
              overflow="hidden"
              sx={{ aspectRatio: "16 / 10" }}
              boxShadow="0 10px 24px -12px rgba(44,24,49,.45)"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={map.thumbUrl}
                alt={`${map.title} map`}
                width={480}
                height={300}
                loading="lazy"
                decoding="async"
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
              <Box
                as="figcaption"
                position="absolute"
                insetX="0"
                bottom="0"
                px="0.6rem"
                py="0.35rem"
                fontFamily="SpaceGrotesk"
                fontWeight={700}
                fontSize="0.78rem"
                color="brand.parchment"
                bg="linear-gradient(transparent, rgba(44,24,49,.9))"
              >
                {map.title}
              </Box>
            </Box>
          ))}
          <Flex
            align="center"
            justify="center"
            textAlign="center"
            p="0.75rem"
            borderRadius="0.6rem"
            border="2px dashed rgba(72,40,79,.4)"
            fontFamily="SpaceGrotesk"
            fontWeight={700}
            fontSize="0.88rem"
            sx={{ aspectRatio: "16 / 10" }}
          >
            Any image URL is a map. Swap it mid-game.
          </Flex>
        </SimpleGrid>
        <Flex mt="0.75rem" gap="0.4rem" wrap="wrap" align="center">
          <Chip>{sandboxMapCount} bundled maps</Chip>
          <Text fontSize="0.85rem" opacity={0.8}>
            legacy boards, community boards, and the ones r/Unmatched keeps drawing.
          </Text>
        </Flex>
      </Box>
    </Grid>
  </Section>
);
