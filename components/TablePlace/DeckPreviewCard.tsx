import { Box, Flex, ListItem, Text, UnorderedList } from "@chakra-ui/react";
import type { DeckPreview } from "@/lib/tableplace/preview";

const Row = ({ label, value }: { label: string; value: string }) => (
  <Flex justify="space-between" gap="1rem" fontSize="0.9rem">
    <Text opacity={0.7}>{label}</Text>
    <Text fontWeight={600} textAlign="right">
      {value}
    </Text>
  </Flex>
);

/** What one deck puts on the table, or why it can't go on it. */
export const DeckPreviewCard = ({
  title,
  preview,
}: {
  title: string;
  preview: DeckPreview;
}) => (
  <Box
    bg="whiteAlpha.700"
    borderRadius="0.5rem"
    p="0.75rem 1rem"
    w="100%"
    border="2px solid"
    borderColor={preview.refused ? "red.400" : "transparent"}
    data-testid="deck-preview"
  >
    <Text fontSize="0.75rem" textTransform="uppercase" opacity={0.7}>
      {title}
    </Text>
    <Text fontFamily="SpaceGrotesk" fontWeight={700} fontSize="1.2rem">
      {preview.deckName}
    </Text>
    <Box mt="0.5rem">
      <Row label="Draw deck" value={`${preview.cards} cards`} />
      {preview.hero && (
        <Row
          label="Hero"
          value={`${preview.hero.name} (${preview.hero.hp} HP)`}
        />
      )}
      {preview.sidekick && (
        <Row
          label="Sidekick"
          value={`${preview.sidekick.count > 1 ? `${preview.sidekick.count} × ` : ""}${preview.sidekick.name} (${preview.sidekick.hp} HP)`}
        />
      )}
      {preview.referenceCards > 0 && (
        <Row
          label="Reference cards"
          value={`${preview.referenceCards} face up`}
        />
      )}
      <Row
        label="HP dials"
        value={
          preview.dials.map((d) => `${d.name} ${d.value}`).join(", ") || "none"
        }
      />
      <Row label="Tokens" value={preview.tokens.join(", ") || "none"} />
    </Box>
    {preview.refused && (
      <Text mt="0.5rem" color="red.700" fontWeight={600} fontSize="0.9rem">
        Can&apos;t go on the table: {preview.refused}
      </Text>
    )}
    {preview.notes.length > 0 && (
      <UnorderedList mt="0.25rem" fontSize="0.75rem" opacity={0.6}>
        {preview.notes.map((n) => (
          <ListItem key={n}>{n}</ListItem>
        ))}
      </UnorderedList>
    )}
    {preview.skipped.length > 0 && (
      <UnorderedList mt="0.25rem" fontSize="0.8rem" opacity={0.8}>
        {preview.skipped.slice(0, 8).map((s) => (
          <ListItem key={s}>{s}</ListItem>
        ))}
        {preview.skipped.length > 8 && (
          <ListItem>…and {preview.skipped.length - 8} more</ListItem>
        )}
      </UnorderedList>
    )}
  </Box>
);
