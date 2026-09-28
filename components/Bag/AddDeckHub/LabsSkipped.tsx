import { Box, Link, Text } from "@chakra-ui/react";
import { LabsSkippedContent, labsSkippedText } from "@/lib/labs";

/**
 * "Not imported from this set: …" (#1000). Plain neutral text, never the
 * orange warning: it is information, and it never blocks saving or playing.
 * Renders nothing when nothing was skipped.
 */
export const LabsSkippedSummary = ({
  skipped,
  imported,
  sourceUrl,
}: {
  skipped: LabsSkippedContent;
  /** what the import did bring in, e.g. "Lucy, 15 cards, hero card" */
  imported?: string;
  sourceUrl?: string;
}) => {
  if (skipped.length === 0) return null;
  return (
    <Box fontSize="0.85rem" opacity={0.85} data-testid="labs-skipped">
      {imported && <Text>Imported: {imported}.</Text>}
      <Text>Not imported from this set: {labsSkippedText(skipped)}.</Text>
      <Text>
        Unbrewed brings in decks only for now. The full set is on{" "}
        {sourceUrl ? (
          <Link href={sourceUrl} isExternal textDecoration="underline">
            Unmatched Labs
          </Link>
        ) : (
          "Unmatched Labs"
        )}
        .
      </Text>
    </Box>
  );
};
