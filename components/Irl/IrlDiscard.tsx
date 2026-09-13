import { Box, Flex, Text, chakra } from "@chakra-ui/react";
import { ReactNode, useState } from "react";
import { DeckImportCardType } from "@/components/DeckPool/deck-import.type";
import { useIrlActions, useIrlGame } from "./irlGame";
import {
  BEBAS,
  CardFace,
  CloseButton,
  DarkButton,
  EmptyNote,
  GROTESK,
  IconBan,
  IconHand,
  IconShuffle,
  IconToBottom,
  IconToTop,
  IconUndo,
  IrlSheet,
  PARCHMENT_CHIP,
  PillButton,
  SAFE_BOTTOM,
  TopBar,
} from "./irl.ui";

type Tab = "discard" | "removed";

/**
 * Discard sheet (issue #798 §5 + §5b): the discard pile newest-on-top with a
 * move per card, the shuffle-back footer (#463's menu), and a Removed tab for
 * cards taken out of the game — which no shuffle ever reads.
 */
export const IrlDiscard = ({ onClose }: { onClose: () => void }) => {
  const { pool } = useIrlGame();
  const actions = useIrlActions();
  const [tab, setTab] = useState<Tab>("discard");
  const discard = pool?.discard ?? [];
  const removed = pool?.removed ?? [];
  const cards = tab === "discard" ? discard : removed;
  // newest on top; keep each card's real index for the move
  const rows = cards.map((card, index) => ({ card, index })).reverse();

  return (
    <IrlSheet label="Discard">
      <TopBar
        title="Discard"
        sub={`${discard.length} ${discard.length === 1 ? "card" : "cards"} · newest on top${
          removed.length ? ` · ${removed.length} removed` : ""
        }`}
        onBack={onClose}
        right={<CloseButton onClick={onClose} />}
      />
      <Flex gap="8px" px="12px" pb="8px" flexShrink={0} role="tablist">
        <TabButton selected={tab === "discard"} onClick={() => setTab("discard")}>
          Discard · {discard.length}
        </TabButton>
        <TabButton selected={tab === "removed"} onClick={() => setTab("removed")}>
          Removed · {removed.length}
        </TabButton>
      </Flex>
      <Flex direction="column" gap="10px" flex="1" minH={0} overflowY="auto" px="12px" py="8px">
        {rows.length === 0 && (
          <EmptyNote>
            {tab === "discard"
              ? "Your discard pile is empty"
              : "Nothing has been removed from the game"}
          </EmptyNote>
        )}
        {rows.map(({ card, index }) => (
          <Row
            key={`${card.title}-${index}`}
            card={card}
            anchor={tab === "discard" ? `discard-row-${index}` : undefined}
          >
            {tab === "discard" ? (
              <>
                <RowButton onClick={() => actions.discardToHand(index)}>
                  <IconHand size={16} />
                  <span>To hand</span>
                </RowButton>
                <RowButton onClick={() => actions.discardToTop(index)}>
                  <IconToTop size={16} />
                  <span>Top</span>
                </RowButton>
                <RowButton onClick={() => actions.discardToBottom(index)}>
                  <IconToBottom size={16} />
                  <span>Bottom</span>
                </RowButton>
                <RowButton onClick={() => actions.removeDiscarded(index)}>
                  <IconBan size={16} />
                  <span>Remove</span>
                </RowButton>
              </>
            ) : (
              <RowButton onClick={() => actions.returnRemoved(index)}>
                <IconUndo size={16} />
                <span>Return to discard</span>
              </RowButton>
            )}
          </Row>
        ))}
      </Flex>
      {tab === "discard" && (
        <Flex direction="column" gap="8px" px="12px" pt="8px" pb={SAFE_BOTTOM} flexShrink={0}>
          <PillButton disabled={!discard.length} onClick={actions.shuffleDiscardIn}>
            <IconShuffle />
            <span>Shuffle all into deck</span>
          </PillButton>
          <Flex gap="8px">
            <PillButton flex="1" fontSize="12px" disabled={!discard.length} onClick={() => actions.shuffleRandomIn(1)}>
              Shuffle 1 random into deck
            </PillButton>
            <PillButton flex="1" fontSize="12px" disabled={!discard.length} onClick={() => actions.shuffleRandomIn(3)}>
              Shuffle 3 random into deck
            </PillButton>
          </Flex>
        </Flex>
      )}
    </IrlSheet>
  );
};

/** One card and its moves; `anchor` names its card for the flights (#811). */
const Row = ({
  card,
  anchor,
  children,
}: {
  card: DeckImportCardType;
  anchor?: string;
  children: ReactNode;
}) => (
  <Flex
    align="center"
    gap="12px"
    p="8px"
    borderRadius="12px"
    bg={PARCHMENT_CHIP}
    color="brand.surfaceDim"
    flexShrink={0}
  >
    <CardFace card={card} width={96} anchor={anchor} />
    <Flex direction="column" gap="6px" flex="1" minW={0}>
      <Text
        fontFamily={BEBAS}
        fontSize="18px"
        lineHeight={1.05}
        textTransform="uppercase"
        whiteSpace="nowrap"
        overflow="hidden"
        textOverflow="ellipsis"
      >
        {card.title}
      </Text>
      <Flex wrap="wrap" gap="6px">
        {children}
      </Flex>
    </Flex>
  </Flex>
);

const RowButton = (props: Parameters<typeof DarkButton>[0]) => (
  <DarkButton fontSize="11px" px="10px" {...props} />
);

const TabButton = ({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) => (
  <chakra.button
    type="button"
    role="tab"
    aria-selected={selected}
    flex="1"
    minH="44px"
    borderRadius="12px"
    fontFamily={GROTESK}
    fontSize="13px"
    fontWeight={700}
    cursor="pointer"
    bg={selected ? "brand.parchment" : "rgba(44, 24, 49, 0.55)"}
    color={selected ? "brand.surfaceDim" : "brand.parchment"}
    border="1px solid rgba(250, 235, 215, 0.2)"
    onClick={onClick}
    sx={{ WebkitTapHighlightColor: "transparent" }}
  >
    <Box as="span">{children}</Box>
  </chakra.button>
);
