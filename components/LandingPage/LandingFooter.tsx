import { Box, Flex, Grid, Text, VisuallyHidden } from "@chakra-ui/react";
import Link from "next/link";
import { IconLogo } from "@/components/Icons/IconLogo";
import { getChangelogEntries } from "@/lib/changelog/entries";
import { shortDate } from "./ChangelogUpdateDialog";
import { FOOTER_COLUMNS } from "./content";

/**
 * Section 10: every surface gets a crawlable link (seo-spec Phase 2.4), plus a
 * freshness line taken from the newest changelog entry.
 */
export const LandingFooter = () => {
  const newest = getChangelogEntries()[0];

  return (
    <Box as="footer" id="footer" aria-labelledby="footer-heading" bg="brand.surfaceDim" color="brand.primary" pt="3rem" pb="1.75rem" fontSize="0.9rem">
      <Box maxW="70rem" mx="auto" px="1rem">
        <VisuallyHidden as="h2" id="footer-heading">
          Everything on Unbrewed
        </VisuallyHidden>
        <Grid templateColumns={{ base: "1fr 1fr", md: "1.3fr repeat(4, 1fr)" }} gap="1.5rem">
          <Box gridColumn={{ base: "1 / -1", md: "auto" }}>
            <Flex as={Link} href="/" align="center" gap="0.6rem" display="inline-flex">
              <IconLogo fontSize="1.4rem" />
              <Text fontFamily="SpaceGrotesk" fontWeight={700}>
                unbrewed
              </Text>
            </Flex>
            <Text mt="0.6rem" maxW="34ch" opacity={0.85}>
              A free, open-source simulator for Unmatched fan decks. Made by JollyGrin and the people in the
              Discord.
            </Text>
          </Box>
          {FOOTER_COLUMNS.map((column) => (
            <Box as="nav" key={column.title} aria-label={column.title}>
              <Text
                as="h3"
                fontFamily="SpaceGrotesk"
                fontSize="0.75rem"
                fontWeight={700}
                letterSpacing="0.12em"
                textTransform="uppercase"
                color="brand.accent"
                mb="0.6rem"
              >
                {column.title}
              </Text>
              <Grid as="ul" listStyleType="none" m={0} p={0} gap="0.35rem">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Box as={Link} href={link.href} opacity={0.9} _hover={{ opacity: 1, textDecoration: "underline" }}>
                      {link.label}
                    </Box>
                  </li>
                ))}
              </Grid>
            </Box>
          ))}
        </Grid>
        <Flex
          mt="2rem"
          pt="1.1rem"
          borderTop="1px solid rgba(241,224,193,.15)"
          wrap="wrap"
          gap="0.6rem"
          justify="space-between"
          fontSize="0.8rem"
          opacity={0.8}
        >
          <Text>
            Unbrewed is not owned by or associated with{" "}
            <Box as={Link} href="https://restorationgames.com/unmatched/" fontWeight={700}>
              Restoration Games, LLC
            </Box>
            . Unmatched is their trademark.
          </Text>
          {newest && <Text>Last updated {shortDate(newest.date, true)} · MIT licence</Text>}
        </Flex>
      </Box>
    </Box>
  );
};
