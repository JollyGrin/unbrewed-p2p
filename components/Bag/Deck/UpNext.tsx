import NextLink from "next/link";
import { Box, Button, Flex, Grid, Text } from "@chakra-ui/react";
import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { BagSourceChip } from "@/components/Bag/Account";
import {
  Cardback,
  DeckStatLine,
  ghostButton,
  goldButton,
  purpleButton,
} from "@/components/Bag/AddDeckHub/DeckPreview";
import { useTableActions } from "@/components/Bag/AddDeckHub/useTableActions";
import { BagSource } from "@/lib/bag/bagStore";
import { DangerConfirm } from "./DangerConfirm";
import { deckSourceLabel } from "./deckSource";

const textLink = {
  variant: "link",
  size: "sm",
  fontSize: "0.82rem",
  fontWeight: 700,
  color: "brand.secondary",
  textDecoration: "underline",
  textUnderlineOffset: "3px",
  minH: "2rem",
} as const;

/**
 * The starred deck as one wide "★ Up next" card (#1538): the three table
 * buttons name their destination, the map line opens the map modal, and
 * everything secondary is a text link. Replaces the 260px rail.
 */
export const UpNextCard = ({
  deck,
  bagSource,
  mapTitle,
  onChangeMap,
  onEdit,
  onShare,
  onToss,
}: {
  deck: DeckImportType;
  bagSource: BagSource;
  mapTitle: string;
  onChangeMap: () => void;
  onEdit: () => void;
  /** account decks only: copies the share link */
  onShare?: () => void;
  onToss: () => void;
}) => {
  const table = useTableActions("upnext");
  const source = deckSourceLabel(deck);

  return (
    <Grid
      data-testid="up-next"
      templateColumns={{ base: "64px 1fr", md: "84px 1fr" }}
      gap={{ base: "0.75rem", md: "1rem" }}
      alignItems="center"
      bg="white"
      border="2px solid"
      borderColor="brand.accent"
      boxShadow="0 0 0 4px rgba(224, 168, 46, 0.16)"
      borderRadius="0.9rem"
      p={{ base: "0.75rem", md: "0.9rem" }}
      color="brand.secondary"
    >
      <Box gridRow={{ md: "1 / span 3" }} alignSelf="center">
        <Cardback deck={deck} w="100%" h={{ base: "90px", md: "118px" }} />
      </Box>
      <Box minW={0}>
        <Flex align="center" gap="0.5rem">
          <Text
            as="span"
            fontSize="0.65rem"
            fontWeight={700}
            letterSpacing="0.08em"
            textTransform="uppercase"
            px="0.5rem"
            py="0.15rem"
            borderRadius="full"
            bg="brand.accent"
            color="brand.surfaceDim"
          >
            ★ Up next
          </Text>
          <BagSourceChip source={bagSource} />
        </Flex>
        <Text
          as="h3"
          fontFamily="BebasNeueRegular"
          fontSize={{ base: "1.6rem", md: "1.9rem" }}
          letterSpacing="0.03em"
          lineHeight={1}
          mt="0.25rem"
          noOfLines={2}
        >
          {deck.name}
        </Text>
        <DeckStatLine deck={deck} prefix={source?.label} fontSize="0.85rem" />
      </Box>

      {/*
        Direct grid children, so on a phone they span both columns under the
        cardback at full width; on md they sit in the right-hand column.
      */}
      <Flex
        mt={{ base: "0.1rem", md: "0" }}
        gap="0.5rem"
        direction={{ base: "column", md: "row" }}
        align={{ base: "stretch", md: "center" }}
        flexWrap="wrap"
        gridColumn={{ base: "1 / -1", md: "2" }}
      >
          <Button
            {...goldButton}
            as={NextLink}
            href={table.href("offline", deck.id)}
            onClick={() => table.track("offline")}
          >
            ▶ Solo table
          </Button>
          <Button
            {...purpleButton}
            as={NextLink}
            href={table.href("connect", deck.id)}
            onClick={() => table.track("connect")}
          >
            ⚔ Invite a friend
          </Button>
          <Button
            {...ghostButton}
            as={NextLink}
            href={table.href("irl", deck.id)}
            onClick={() => table.track("irl")}
          >
            📱 In person
          </Button>
        </Flex>

      <Flex
        fontSize="0.82rem"
        opacity={0.9}
        gap="0.35rem"
        flexWrap="wrap"
        align="center"
        gridColumn={{ base: "1 / -1", md: "2" }}
      >
          <Text as="span">
            Map: <b>{mapTitle}</b>
          </Text>
          <Button {...textLink} onClick={onChangeMap}>
            change
          </Button>
          <Text as="span" opacity={0.5} px="0.2rem">
            ·
          </Text>
          <Button {...textLink} onClick={onEdit}>
            Edit deck
          </Button>
          {onShare && (
            <>
              <span>·</span>
              <Button {...textLink} onClick={onShare}>
                Share
              </Button>
            </>
          )}
        <span>·</span>
        <DangerConfirm label="Toss" question={`Toss ${deck.name}?`} onConfirm={onToss} />
      </Flex>
    </Grid>
  );
};

/**
 * Every deck as a compact tile, in a stable position. Tapping one makes it
 * Up next; the starred one stays where it is, with a gold ring and a ★.
 */
export const DeckTile = ({
  deck,
  bagSource,
  starred = false,
  onSelect,
}: {
  deck: DeckImportType;
  bagSource: BagSource;
  starred?: boolean;
  onSelect: (id: string) => void;
}) => {
  const hero = deck.deck_data?.hero;
  const source = deckSourceLabel(deck);
  return (
    <Box
      as="button"
      type="button"
      textAlign="left"
      bg="white"
      border="1px solid"
      borderColor={starred ? "brand.accent" : "rgba(72, 40, 79, 0.14)"}
      boxShadow={starred ? "0 0 0 3px rgba(224, 168, 46, 0.45)" : undefined}
      borderRadius="0.6rem"
      overflow="hidden"
      cursor="pointer"
      transition="transform 0.12s ease-out, box-shadow 0.12s ease-out"
      _hover={{ transform: "translateY(-2px)", boxShadow: "0 6px 16px rgba(20, 8, 24, 0.22)" }}
      _focusVisible={{ outline: "3px solid", outlineColor: "brand.accent" }}
      aria-label={starred ? `${deck.name}: up next` : `${deck.name}: make it up next`}
      aria-pressed={starred}
      data-starred={starred || undefined}
      onClick={() => onSelect(deck.id)}
    >
      <Box
        h={{ base: "64px", md: "78px" }}
        position="relative"
        bg={deck.deck_data?.appearance?.highlightColour ?? "brand.secondary"}
        bgImg={deck.deck_data?.appearance?.cardbackUrl}
        bgPos="center 30%"
        bgSize="cover"
        _after={{
          content: '""',
          position: "absolute",
          inset: 0,
          bg: "linear-gradient(180deg, rgba(20,8,24,0) 50%, rgba(20,8,24,0.5))",
        }}
      >
        {source && (
          <Text
            as="span"
            position="absolute"
            top="0.35rem"
            left="0.35rem"
            zIndex={1}
            fontSize="0.55rem"
            fontWeight={700}
            letterSpacing="0.06em"
            textTransform="uppercase"
            px="0.4rem"
            py="0.1rem"
            borderRadius="full"
            bg="rgba(250, 235, 215, 0.92)"
            color="brand.secondary"
          >
            {source.chip}
          </Text>
        )}
        <Box position="absolute" top="0.35rem" right="0.35rem" zIndex={1} color="white">
          <BagSourceChip source={bagSource} />
        </Box>
        {starred && (
          <Text
            as="span"
            aria-hidden
            position="absolute"
            bottom="0.3rem"
            right="0.35rem"
            zIndex={1}
            fontSize="0.8rem"
            fontWeight={700}
            lineHeight={1}
            px="0.35rem"
            py="0.15rem"
            borderRadius="full"
            bg="brand.accent"
            color="brand.surfaceDim"
          >
            ★
          </Text>
        )}
      </Box>
      <Text
        fontWeight={700}
        fontSize="0.8rem"
        lineHeight={1.15}
        color="brand.secondary"
        px="0.5rem"
        pt="0.4rem"
        noOfLines={2}
      >
        {deck.name}
      </Text>
      <Text
        fontFamily="ArchivoNarrow"
        fontSize="0.72rem"
        color="brand.secondary"
        opacity={0.7}
        px="0.5rem"
        pb="0.5rem"
      >
        {hero ? `❤ ${hero.hp} · ⇢ ${hero.move}` : " "}
      </Text>
    </Box>
  );
};

/** The last tile: focuses the paste bar. */
export const AddTile = ({ onClick }: { onClick: () => void }) => (
  <Flex
    as="button"
    type="button"
    direction="column"
    align="center"
    justify="center"
    gap="0.2rem"
    minH={{ base: "7rem", md: "8.5rem" }}
    border="2px dashed rgba(72, 40, 79, 0.3)"
    borderRadius="0.6rem"
    color="brand.secondary"
    fontWeight={700}
    fontSize="0.8rem"
    cursor="pointer"
    _hover={{ bg: "rgba(72, 40, 79, 0.06)" }}
    onClick={onClick}
  >
    <Text fontSize="1.5rem" lineHeight={1}>
      +
    </Text>
    Add another
  </Flex>
);
