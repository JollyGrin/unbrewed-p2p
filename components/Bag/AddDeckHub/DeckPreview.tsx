import { ReactNode, useState } from "react";
import { Box, BoxProps, Button, Flex, Text, Wrap } from "@chakra-ui/react";
import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { hasFieldedSidekick } from "@/components/DeckPool/PoolFns";
import { TableDestination } from "@/lib/deckAnalytics";
import { useTableActions } from "./useTableActions";

export type HeroOption = { id: string; name: string };

/** "❤ 17 · ⇢ 2 · melee · Watson (sidekick) · 30 cards" */
export const DeckStatLine = ({
  deck,
  prefix,
  ...rest
}: {
  deck: DeckImportType;
  /** e.g. the source site, shown first */
  prefix?: string;
  fontSize?: string;
}) => {
  const hero = deck.deck_data?.hero;
  const sidekick = deck.deck_data?.sidekick;
  // the draw pile: hero/rule cards ride along as reference tokens, not cards
  const cards = (deck.deck_data?.cards ?? []).reduce(
    (n, card) => n + (card.isCharacterCard ? 0 : Number(card.quantity) || 0),
    0,
  );
  const parts: ReactNode[] = [];
  if (prefix) parts.push(prefix);
  if (hero) {
    parts.push(
      <>
        ❤ <b>{hero.hp}</b>
      </>,
      <>
        ⇢ <b>{hero.move}</b>
      </>,
      hero.isRanged ? "ranged" : "melee",
    );
  }
  if (hasFieldedSidekick(sidekick)) {
    parts.push(
      `${sidekick.name}${(sidekick.quantity ?? 1) > 1 ? ` ×${sidekick.quantity}` : ""} (sidekick)`,
    );
  }
  if (cards > 0) parts.push(`${cards} cards`);
  return (
    <Text fontFamily="ArchivoNarrow" fontSize="0.9rem" opacity={0.8} {...rest}>
      {parts.map((part, i) => (
        <Text as="span" key={i} whiteSpace="nowrap">
          {i > 0 && " · "}
          {part}
        </Text>
      ))}
    </Text>
  );
};

/** A deck's cardback, as a small tilted card. */
export const Cardback = ({
  deck,
  w = "84px",
  h = "118px",
  tilt = true,
}: {
  deck: DeckImportType;
  w?: BoxProps["w"];
  h?: BoxProps["h"];
  tilt?: boolean;
}) => (
  <Box
    w={w}
    h={h}
    flexShrink={0}
    borderRadius="0.5rem"
    bg={deck.deck_data?.appearance?.highlightColour ?? "brand.secondary"}
    bgImg={deck.deck_data?.appearance?.cardbackUrl}
    bgPos="center"
    bgSize="cover"
    boxShadow="0 6px 14px rgba(20, 8, 24, 0.35)"
    transform={tilt ? "rotate(-3deg)" : undefined}
  />
);

const buttonBase = {
  h: "2.75rem",
  px: "1rem",
  borderRadius: "0.6rem",
  fontWeight: 700,
  w: { base: "100%", md: "auto" },
} as const;

export const goldButton = {
  ...buttonBase,
  bg: "brand.accent",
  color: "brand.surfaceDim",
  boxShadow: "0 3px 0 #C48F1E",
  _hover: { bg: "brand.accentDeep" },
} as const;

export const purpleButton = {
  ...buttonBase,
  bg: "brand.secondary",
  color: "brand.parchment",
  boxShadow: "0 3px 0 #2C1831",
  _hover: { opacity: 0.92, bg: "brand.secondary" },
} as const;

export const ghostButton = {
  ...buttonBase,
  variant: "outline",
  color: "brand.secondary",
  borderColor: "rgba(72, 40, 79, 0.3)",
  borderWidth: "2px",
  bg: "transparent",
  _hover: { bg: "rgba(72, 40, 79, 0.06)" },
} as const;

/**
 * A fetched deck, ending in a table rather than in Save (#1538): cardback,
 * name, stats, the hero pills of a multi-hero Labs set, then Solo table /
 * Invite a friend / Save for later. `onSave` puts the deck in the bag and
 * stars it, resolving its bag id — or nothing when the save was refused
 * (storage full, a blocked author, or the player kept their edited copy),
 * in which case no table opens.
 */
export const DeckPreview = ({
  deck,
  source,
  heroes,
  characterId,
  onPickHero,
  onSave,
  isDisabled,
  prompt,
  note,
  children,
}: {
  deck: DeckImportType;
  /** e.g. "Unmatched Labs · Baker Street Irregulars" */
  source: string;
  heroes?: HeroOption[];
  characterId?: string;
  onPickHero?: (id: string) => void;
  onSave: () => Promise<string | undefined>;
  isDisabled?: boolean;
  /** the replace-confirm step (#1033) */
  prompt?: ReactNode;
  /** a non-blocking heads-up under the buttons */
  note?: ReactNode;
  children?: ReactNode;
}) => {
  const table = useTableActions("preview");
  const [busy, setBusy] = useState<TableDestination | "save">();

  const go = async (destination?: TableDestination) => {
    if (busy) return;
    setBusy(destination ?? "save");
    try {
      const id = await onSave();
      if (id && destination) await table.open(destination, id);
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <Box
      data-testid="deck-preview"
      position="relative"
      overflow="hidden"
      bg="brand.parchment"
      border="1px solid rgba(72, 40, 79, 0.18)"
      borderRadius="0.9rem"
      p={{ base: "0.85rem", md: "1rem" }}
      color="brand.secondary"
      _before={{
        content: '""',
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        h: "4px",
        bg: "linear-gradient(90deg, #E0A82E, #C48F1E, #48284F)",
      }}
    >
      <Flex gap={{ base: "0.75rem", md: "1rem" }} align="flex-start">
        <Cardback deck={deck} w="72px" h="100px" />
        <Box flex="1" minW={0}>
          <Text
            fontSize="0.7rem"
            fontWeight={700}
            letterSpacing="0.06em"
            textTransform="uppercase"
            color="brand.accentDeep"
          >
            <Text as="span" color="brand.positive" mr="0.3rem">
              ●
            </Text>
            {source}
          </Text>
          <Text
            as="h3"
            fontFamily="BebasNeueRegular"
            fontSize={{ base: "1.6rem", md: "1.9rem" }}
            letterSpacing="0.03em"
            lineHeight={1}
            mt="0.15rem"
          >
            {deck.name}
          </Text>
          <DeckStatLine deck={deck} />
          {heroes && heroes.length > 1 && (
            <Wrap spacing="0.35rem" mt="0.5rem" role="radiogroup" aria-label="Hero">
              {heroes.map((hero) => {
                const on = hero.id === characterId;
                return (
                  <Button
                    key={hero.id}
                    role="radio"
                    aria-checked={on}
                    size="xs"
                    h="1.75rem"
                    px="0.7rem"
                    borderRadius="full"
                    fontSize="0.78rem"
                    border="1.5px solid"
                    borderColor={on ? "brand.secondary" : "rgba(72, 40, 79, 0.35)"}
                    bg={on ? "brand.secondary" : "white"}
                    color={on ? "brand.parchment" : "brand.secondary"}
                    _hover={{ bg: on ? "brand.secondary" : "rgba(72, 40, 79, 0.08)" }}
                    onClick={() => onPickHero?.(hero.id)}
                  >
                    {hero.name}
                  </Button>
                );
              })}
            </Wrap>
          )}
        </Box>
      </Flex>

      {prompt && <Box mt="0.75rem">{prompt}</Box>}

      <Flex
        mt="0.85rem"
        gap="0.5rem"
        direction={{ base: "column", md: "row" }}
        align={{ base: "stretch", md: "center" }}
        flexWrap="wrap"
      >
        <Button
          {...goldButton}
          isDisabled={isDisabled || !!busy}
          isLoading={busy === "offline"}
          onClick={() => go("offline")}
        >
          ▶ Solo table
        </Button>
        <Button
          {...purpleButton}
          isDisabled={isDisabled || !!busy}
          isLoading={busy === "connect"}
          onClick={() => go("connect")}
        >
          ⚔ Invite a friend
        </Button>
        <Button
          variant="link"
          color="brand.secondary"
          fontWeight={700}
          fontSize="0.9rem"
          textDecoration="underline"
          textUnderlineOffset="3px"
          h={{ base: "2.5rem", md: "auto" }}
          px={{ base: 0, md: "0.5rem" }}
          isDisabled={isDisabled || !!busy}
          isLoading={busy === "save"}
          onClick={() => go()}
        >
          Save for later
        </Button>
      </Flex>

      {note && (
        <Box mt="0.6rem" fontSize="0.82rem" opacity={0.85}>
          {note}
        </Box>
      )}
      {children}
    </Box>
  );
};
