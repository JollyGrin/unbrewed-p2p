import { Box, Grid, Text } from "@chakra-ui/react";
import Link from "next/link";
import { FindMatch } from "@/components/Discord";
import { getChangelogEntries } from "@/lib/changelog/entries";
import { shortDate } from "./ChangelogUpdateDialog";
import { Eyebrow, H2, Section } from "./ui";

/** How many of the newest changelog entries the landing lists. */
const LATEST = 4;

/** Section 8: the Discord module + the newest changelog entries. */
export const Community = () => {
  const entries = getChangelogEntries();
  const latest = entries.slice(0, LATEST);

  return (
    <Section id="community">
      <Eyebrow>Community</Eyebrow>
      <H2 id="community">Matches happen on Discord. Decks ship every week.</H2>
      <Grid templateColumns={{ base: "1fr", lg: "1.1fr 1fr" }} gap="1.25rem" mt="0.5rem" alignItems="start">
        {/* FindMatch carries its own top margin from the old single-column page. */}
        <Box minW={0} sx={{ "& > section": { mt: "1.25rem" } }}>
          <FindMatch />
        </Box>
        <Box minW={0} mt="1.25rem">
          <Text as="h3" fontFamily="SpaceGrotesk" fontWeight={700} fontSize="1.2rem" mb="0.6rem">
            What&apos;s new
          </Text>
          <Grid as="ul" listStyleType="none" m={0} p={0} gap="0.5rem">
            {latest.map((entry) => (
              <Box as="li" key={entry.id}>
                <Grid
                  as={Link}
                  href={`/changelog#changelog-entry-${entry.id}`}
                  templateColumns="1fr auto"
                  gap="0.75rem"
                  alignItems="center"
                  px="0.9rem"
                  py="0.75rem"
                  borderRadius="0.6rem"
                  bg="#FFF6E8"
                  border="1px solid rgba(72,40,79,.18)"
                  _hover={{ borderColor: "brand.secondary" }}
                >
                  <Box minW={0}>
                    <Text fontFamily="SpaceGrotesk" fontWeight={700}>
                      {entry.title}
                    </Text>
                    <Text fontSize="0.82rem" opacity={0.8} noOfLines={2}>
                      {entry.summary}
                    </Text>
                  </Box>
                  <Text fontSize="0.75rem" opacity={0.7} whiteSpace="nowrap">
                    {shortDate(entry.date, true)}
                  </Text>
                </Grid>
              </Box>
            ))}
          </Grid>
          <Box
            as={Link}
            href="/changelog"
            display="inline-block"
            mt="0.75rem"
            fontFamily="SpaceGrotesk"
            fontWeight={700}
            fontSize="0.9rem"
            textDecoration="underline"
          >
            All {entries.length} updates →
          </Box>
        </Box>
      </Grid>
    </Section>
  );
};
