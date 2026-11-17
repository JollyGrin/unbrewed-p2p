/**
 * A free activated hero ability as a button (protocol v41, engine #1080 —
 * `USE_ABILITY`; first consumer POMNI's Reward 2 / Reward 3, p2p #1693).
 *
 * It stands with Maneuver / Scheme / Attack but is NOT one of them: pressing it
 * costs no action, so it must not read as a fourth action. A dashed gold edge
 * and a "Free" tag say so, and it never wears an action pip. The text is the
 * server's own `label`; the card the ability is printed on, when the server
 * names one, is its icon and its hover / press-and-hold preview.
 *
 * Generic on purpose: nothing here knows POMNI. Any hero's future ability
 * arrives through the same action and draws the same way.
 */
import { Box, Button, Kbd, Tag, Text } from "@chakra-ui/react";
import { TbSparkles } from "react-icons/tb";
import { Card } from "@/components/CardFactory/Card";
import { useCardPreview } from "@/components/Pro/CardPreview";
import type { DeckImportCardType } from "@/components/DeckPool/deck-import.type";

/** Said by the tag's title and the button's accessible name. */
export const FREE_ABILITY_BLURB = "Bonus: does not use an action";

export const AbilityButton = ({
  label,
  ability,
  card,
  hotkey = null,
  minH,
  stretch = false,
  onPress,
}: {
  /** the button text — the server's `label` */
  label: string;
  /** the ability id, for tests and analytics hooks; never shown */
  ability: string;
  /** the resolved face of the ability's card; null = no card, or art not loaded */
  card: DeckImportCardType | null;
  /** the digit that fires this row on desktop */
  hotkey?: number | null;
  minH: string;
  /** share the row's width (the phone sheet's bonus strip). A strip button never
   *  shrinks below its one-line width (issue #1703: two of them at 390px read
   *  "Reward / 2"), so it is packed a little tighter, and a label too long to share
   *  a row takes the next row instead of wrapping inside half of one. */
  stretch?: boolean;
  onPress: () => void;
}) => {
  // Hover / focus / press-and-hold shows the card large. On touch, a hold that
  // peeked swallows its own click, so reading the card never presses the button.
  const preview = useCardPreview(card);
  return (
    <Button
      data-testid="pro-ability-button"
      data-ability={ability}
      data-strip={stretch ? "true" : undefined}
      aria-label={`${label}. ${FREE_ABILITY_BLURB}`}
      size="sm"
      flex={stretch ? "1 1 0" : undefined}
      minW={stretch ? "fit-content" : 0}
      maxW={stretch ? "100%" : undefined}
      height="auto"
      minH={minH}
      py="0.35rem"
      px={stretch ? "0.5rem" : undefined}
      display="flex"
      justifyContent="flex-start"
      gap={stretch ? "0.35rem" : "0.45rem"}
      whiteSpace="normal"
      textAlign="left"
      bg="rgba(224, 168, 46, 0.08)"
      color="brand.parchment"
      border="1px dashed"
      borderColor="rgba(224, 168, 46, 0.75)"
      _hover={{ bg: "rgba(224, 168, 46, 0.2)" }}
      _active={{ bg: "rgba(224, 168, 46, 0.28)" }}
      onClick={onPress}
      {...preview}
    >
      {hotkey != null && (
        <Kbd
          flexShrink={0}
          bg="rgba(255,255,255,0.08)"
          borderColor="rgba(255,255,255,0.25)"
          color="brand.parchment"
          fontSize="0.68rem"
          px="0.35rem"
        >
          {hotkey}
        </Kbd>
      )}
      {card ? (
        <Box
          as="span"
          data-testid="pro-ability-card"
          display="block"
          w="1.45rem"
          flexShrink={0}
          borderRadius="0.15rem"
          overflow="hidden"
          boxShadow="0 1px 3px rgba(0,0,0,0.6)"
          pointerEvents="none"
          sx={{ aspectRatio: "63 / 88" }}
        >
          <Card card={card} />
        </Box>
      ) : (
        <Box as="span" color="brand.accent" display="inline-flex" flexShrink={0}>
          <TbSparkles size="1.1rem" />
        </Box>
      )}
      <Text as="span" fontWeight={700} minW={0}>
        {label}
      </Text>
      <Tag
        size="sm"
        ml="auto"
        flexShrink={0}
        bg="transparent"
        color="brand.accent"
        border="1px solid"
        borderColor="rgba(224, 168, 46, 0.6)"
        fontWeight={700}
        letterSpacing="0.04em"
        textTransform="uppercase"
        fontSize="0.6rem"
        title={FREE_ABILITY_BLURB}
      >
        Free
      </Tag>
    </Button>
  );
};
