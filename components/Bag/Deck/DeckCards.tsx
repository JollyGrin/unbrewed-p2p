import { Card } from "@/components/CardFactory/Card";
import { CardTilt } from "@/components/CardFactory/CardTilt";
import {
  DeckImportCardType,
  DeckImportType,
} from "@/components/DeckPool/deck-import.type";
import { Flex, Box, Text, Switch } from "@chakra-ui/react";
import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { CardInspector } from "./CardInspector";
import { HeroSheet } from "./HeroSheet";

/** Sum of `quantity` (default 1): "N cards" counts copies, not unique faces. */
const weightedCount = (cards: DeckImportCardType[]) =>
  cards.reduce((n, c) => n + (c.quantity ?? 1), 0);

/** Section header: Bebas title, muted subtitle, hairline rule underneath. */
const SectionHeader = ({ title, subtitle }: { title: string; subtitle: string }) => (
  <Flex
    as="header"
    align="baseline"
    gap="0.6rem"
    mx="0.5rem"
    mt="1rem"
    pb="0.4rem"
    borderBottom="1px solid rgba(255,255,255,0.1)"
    wrap="wrap"
  >
    <Text
      as="h3"
      fontFamily="BebasNeueRegular"
      fontSize="1.4rem"
      lineHeight="1"
      fontWeight={400}
      color="brand.accent"
    >
      {title}
    </Text>
    <Text fontSize="0.8rem" opacity={0.7}>
      {subtitle}
    </Text>
  </Flex>
);

/**
 * The inspector's "Keep out of draw deck" row. The card moves between the
 * grid sections as soon as the flag flips; the inspector stays on it.
 */
const KeepOutToggle = ({
  card,
  onToggle,
}: {
  card: DeckImportCardType;
  onToggle: () => void;
}) => (
  // A div, not a label: Chakra's Switch already renders its own <label>, and
  // nesting labels is invalid HTML. The row's onClick covers the text and
  // padding. Clicks that start inside the Switch are left to its onChange (its
  // own label/input click would otherwise toggle twice), so keyboard Space and
  // a click on the track also flip exactly once.
  <Flex
    onClick={(e) => {
      if ((e.target as HTMLElement).closest("label")) return;
      onToggle();
    }}
    align="center"
    gap="0.75rem"
    p="0.75rem"
    borderRadius="10px"
    bg="rgba(255,255,255,0.04)"
    border="1px solid rgba(255,255,255,0.08)"
    cursor="pointer"
    _hover={{ bg: "rgba(255,255,255,0.07)" }}
  >
    <Switch
      isChecked={!!card.isCharacterCard}
      onChange={onToggle}
      colorScheme="yellow"
      aria-label="Keep out of draw deck"
      flexShrink={0}
    />
    <Box>
      <Text fontWeight={700} fontSize="0.9rem">
        Keep out of draw deck
      </Text>
      <Text fontSize="0.72rem" opacity={0.6} mt="2px">
        Hero / rule card. Sits on the table, never shuffled in.
      </Text>
    </Box>
  </Flex>
);

export const DeckCards = ({
  decks,
  selectedDeckId,
  onToggleCharacterCard,
  onUpdateDeck,
}: {
  decks?: DeckImportType[];
  selectedDeckId?: string;
  /**
   * when set, the card inspector offers the "Keep out of draw deck" switch
   * (flags the card as a hero/rule card). `cardIndex` is the card's index in
   * `deck_data.cards`, whichever section it is shown in.
   */
  onToggleCharacterCard?: (cardIndex: number) => void;
  /** persists the hero sheet's editors (hero info, cardback, tokens); the sheet is only rendered when set */
  onUpdateDeck?: (updated: DeckImportType) => Promise<void> | void;
}) => {
  const deck = decks?.find((deck) => deck.id === selectedDeckId);
  const cards = deck?.deck_data?.cards;
  const isImageDeck = deck?.tags?.includes("image-deck");
  // The card being inspected, as its index in `deck_data.cards` (a stable
  // identity). The inspector's own `index` is a position in `ordered` below,
  // derived from this, so it follows the card across a section change.
  const [inspecting, setInspecting] = useState<number | null>(null);

  // Grid order = inspector order: the Draw deck section, then Kept out. Each
  // entry keeps its `deck_data.cards` index for toggling.
  const { drawDeck, keptOut, ordered } = useMemo(() => {
    const entries = (cards ?? []).map((card, index) => ({ card, index }));
    const drawDeck = entries.filter((e) => !e.card.isCharacterCard);
    const keptOut = entries.filter((e) => e.card.isCharacterCard);
    return { drawDeck, keptOut, ordered: [...drawDeck, ...keptOut] };
  }, [cards]);

  const drawCount = weightedCount(drawDeck.map((e) => e.card));
  const inspectorIndex =
    inspecting === null ? null : ordered.findIndex((e) => e.index === inspecting);
  // the inspected card vanished (deck swapped / card removed): forget it so a
  // later card landing on that index doesn't pop the inspector open
  useEffect(() => {
    if (inspectorIndex === -1) setInspecting(null);
  }, [inspectorIndex]);
  const closeInspector = useCallback(() => setInspecting(null), []);

  // Kept out shows for any deck with a flagged card (Labs decks arrive
  // pre-flagged); the dashed "nothing flagged yet" tile is for image decks
  // the user can actually flag (the AddDeckHub previews cannot).
  const showEmptyTile = !!isImageDeck && !!onToggleCharacterCard;
  const showKeptOut = keptOut.length > 0 || showEmptyTile;

  const renderCard = ({ card, index }: { card: DeckImportCardType; index: number }) => (
    <CardTilt
      key={card.title + index}
      maxW="200px"
      cursor="pointer"
      role="button"
      tabIndex={0}
      aria-label={`Inspect ${card.title}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setInspecting(index);
        }
      }}
      // No outline / border at rest: Chakra turns `outline="none"` into a
      // transparent 2px outline, and any outlineColor then paints it. Only the
      // keyboard focus ring is drawn.
      _focusVisible={{
        outline: "3px solid",
        outlineColor: "brand.primary",
        outlineOffset: "2px",
      }}
      onClick={() => setInspecting(index)}
    >
      <Box
        borderRadius="0.4rem"
        filter={card.isCharacterCard ? "saturate(.55) brightness(.8)" : undefined}
      >
        <Card card={card} />
      </Box>
      {card.isCharacterCard && (
        <Text
          data-testid="kept-out-pill"
          position="absolute"
          bottom="0"
          left="0"
          right="0"
          textAlign="center"
          fontSize="0.6rem"
          fontWeight={700}
          letterSpacing="0.04em"
          color="brand.surfaceDim"
          bg="brand.accent"
          borderBottomRadius="0.4rem"
          py="1px"
        >
          HERO / RULE
        </Text>
      )}
    </CardTilt>
  );

  // py/px leave room for the hovered card's 1.08 scale + tilt, so it never
  // reaches the scroll container edge (a transform that does would grow a
  // scrollbar for the duration of the hover).
  const grid = (children: ReactNode, testId: string) => (
    <Flex
      data-testid={testId}
      flexWrap="wrap"
      gap="0.5rem"
      mx="0.5rem"
      py="16px"
      px="6px"
    >
      {children}
    </Flex>
  );

  return (
    <Box>
      {/* Only on the editable Bag screen. The AddDeckHub previews already head
          the deck with DeckPreview's hero name; a second summary under it would
          repeat the name (and a second heading). */}
      {deck && onUpdateDeck && <HeroSheet deck={deck} onSave={onUpdateDeck} />}
      <SectionHeader
        title="Draw deck"
        subtitle={`${drawCount} ${drawCount === 1 ? "card" : "cards"}, shuffled at the start of a game`}
      />
      {grid(drawDeck.map(renderCard), "draw-deck-grid")}
      {showKeptOut && (
        <>
          <SectionHeader
            title="Kept out"
            subtitle="hero & rule cards · placed on the table, never shuffled"
          />
          {grid(
            keptOut.length > 0 ? (
              keptOut.map(renderCard)
            ) : (
              <Flex
                data-testid="kept-out-empty"
                align="center"
                justify="center"
                w="min(200px, 100%)"
                minH="120px"
                p="0.75rem"
                border="2px dashed rgba(255,255,255,0.2)"
                borderRadius="0.6rem"
                fontSize="0.8rem"
                opacity={0.6}
                textAlign="center"
              >
                No hero or rule cards flagged yet
              </Flex>
            ),
            "kept-out-grid",
          )}
        </>
      )}
      <CardInspector
        cards={ordered.map((e) => e.card)}
        index={inspectorIndex === -1 ? null : inspectorIndex}
        onIndexChange={(i) => {
          const target = ordered[i];
          if (target) setInspecting(target.index);
        }}
        onClose={closeInspector}
        // Gated on the callback alone, exactly as the grid click was on main:
        // DeckDetail passes it for EVERY deck, and Labs decks (arrive
        // pre-flagged) or any deck flagged earlier must stay changeable.
        // (#1578's "image decks only" premise is wrong — don't re-add it.)
        renderActions={
          onToggleCharacterCard
            ? (card, position) => (
                <KeepOutToggle
                  card={card}
                  // map the inspector's position back to deck_data.cards
                  onToggle={() => {
                    const entry = ordered[position];
                    if (entry) onToggleCharacterCard(entry.index);
                  }}
                />
              )
            : undefined
        }
      />
    </Box>
  );
};
