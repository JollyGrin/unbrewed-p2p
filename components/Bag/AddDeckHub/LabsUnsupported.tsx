import { ReactNode } from "react";
import {
  Box,
  Button,
  Link,
  ListItem,
  OrderedList,
  Text,
  UnorderedList,
} from "@chakra-ui/react";
import { LabsUnsupportedFeature } from "@/lib/labs";

/**
 * The Labs TTS-export → card-image import path, for decks our template can't
 * draw. Without `onOpenImages` (off the Bag page) the option is named, not linked.
 */
export const LabsTtsSteps = ({ onOpenImages }: { onOpenImages?: () => void }) => (
  <OrderedList spacing="0.2rem" ml="1.25rem">
    <ListItem>
      On Unmatched Labs, open the set and choose{" "}
      <b>Export Tabletop Simulator object</b>, with <b>Host assets online</b>{" "}
      checked.
    </ListItem>
    <ListItem>Save the file it gives you (or copy its JSON).</ListItem>
    <ListItem>
      Upload or paste it in{" "}
      {onOpenImages ? (
        <Link as="button" textDecoration="underline" fontWeight={700} onClick={onOpenImages}>
          Import from The Unmatched Club
        </Link>
      ) : (
        <b>Import from The Unmatched Club</b>
      )}{" "}
      — that option takes any deck as card images, not just the Club&apos;s.
    </ListItem>
  </OrderedList>
);

/**
 * "This deck won't look right" — shown by the Bag's Labs panel before saving,
 * and by /offline and /irl before playing a `?deckId=labs:` link (#979).
 * `children` go under the steps (e.g. the deep link's own buttons).
 */
export const LabsUnsupportedWarning = ({
  deckName,
  unsupported,
  onOpenImages,
  children,
}: {
  deckName: string;
  unsupported: LabsUnsupportedFeature[];
  onOpenImages?: () => void;
  children?: ReactNode;
}) => (
  <Box
    role="alert"
    mb="0.75rem"
    p="0.85rem"
    borderRadius="0.5rem"
    bg="orange.50"
    border="2px solid"
    borderColor="orange.400"
    color="gray.800"
    fontSize="0.9rem"
    maxW="680px"
    textAlign="left"
  >
    <Text fontWeight={700} fontSize="1rem" mb="0.3rem">
      ⚠ This deck won&apos;t look right with our card template
    </Text>
    <Text mb="0.3rem">
      Unmatched Labs hasn&apos;t published finished art for some of{" "}
      {deckName}&apos;s cards, so our template draws them — and they use
      features it can&apos;t draw:
    </Text>
    <UnorderedList ml="1.25rem" mb="0.5rem" spacing="0.1rem">
      {unsupported.map((feature) => (
        <ListItem key={feature.id}>
          {feature.label}
          {feature.cards.length > 0 && (
            <Text as="span" opacity={0.75}>
              {" "}
              — {feature.cards.join(", ")}
            </Text>
          )}
        </ListItem>
      ))}
    </UnorderedList>
    <Text fontWeight={700} mb="0.2rem">
      To play it with its real card art:
    </Text>
    <LabsTtsSteps onOpenImages={onOpenImages} />
    {onOpenImages && (
      <Button size="sm" mt="0.6rem" colorScheme="orange" onClick={onOpenImages}>
        Open the card-image import
      </Button>
    )}
    {children}
  </Box>
);
