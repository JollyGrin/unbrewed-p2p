import {
  ReactNode,
  PointerEvent as ReactPointerEvent,
  TouchEvent as ReactTouchEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Box,
  Flex,
  IconButton,
  Modal,
  ModalContent,
  ModalOverlay,
  Text,
} from "@chakra-ui/react";
import { Card } from "@/components/CardFactory/Card";
import { actions as cardText } from "@/components/CardFactory/card.helpers";
import {
  DeckImportCardType,
  UnmatchedCardType,
} from "@/components/DeckPool/deck-import.type";

/** Pill colour per card type (the mockup's palette). */
export const CARD_TYPE_COLOURS: Record<UnmatchedCardType, string> = {
  attack: "#C8333A",
  defence: "#3C6BA8",
  versatile: "#6B3FA0",
  scheme: "#D9A133",
};

export type CardInspectorProps = {
  /** Every card of the deck, in grid order. Navigation wraps around this list. */
  cards: DeckImportCardType[];
  /** Index into `cards` of the card being inspected; `null` keeps it closed. */
  index: number | null;
  /** Called with the new index for ‹ ›, ← →, swipe and filmstrip clicks. */
  onIndexChange: (index: number) => void;
  /** Called for Esc, backdrop click and the close button. */
  onClose: () => void;
  /**
   * Slot under the rules text, rendered for the card currently shown. Empty
   * when omitted. The "Keep out of draw deck" toggle (#1578) plugs in here.
   */
  renderActions?: (card: DeckImportCardType, index: number) => ReactNode;
};

/**
 * Click-a-card detail view: the real `Card` large, a stats + rules panel,
 * ‹ › / arrow keys / swipe navigation (wrapping) and a filmstrip of the deck.
 */
export const CardInspector = ({
  cards,
  index,
  onIndexChange,
  onClose,
  renderActions,
}: CardInspectorProps) => {
  const count = cards.length;
  const isOpen = index !== null && index >= 0 && index < count;
  const card = isOpen ? cards[index] : undefined;

  const step = (delta: number) => {
    if (!isOpen || count === 0) return;
    onIndexChange((index + delta + count) % count);
  };

  // ← → move while open. A window listener (not onKeyDown on the modal) so the
  // keys work wherever focus sits inside the dialog.
  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        stepRef.current(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        stepRef.current(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen]);

  // swipe left/right on the card area (touch devices)
  const touchStartX = useRef<number | null>(null);
  const onTouchStart = (e: ReactTouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: ReactTouchEvent) => {
    const start = touchStartX.current;
    touchStartX.current = null;
    const end = e.changedTouches[0]?.clientX;
    if (start === null || end === undefined) return;
    const dx = end - start;
    if (Math.abs(dx) >= 50) step(dx < 0 ? 1 : -1);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      isCentered
      motionPreset="none"
      scrollBehavior="outside"
    >
      <ModalOverlay bg="rgba(20, 8, 24, 0.86)" backdropFilter="blur(6px)" />
      <ModalContent
        aria-label={card ? `Inspect ${card.title}` : "Inspect card"}
        bg="transparent"
        boxShadow="none"
        maxW="min(860px, 100vw)"
        w="auto"
        mx="auto"
        my="0"
        color="brand.highlight"
        // keep the card's own tilt/shadow from being clipped
        overflow="visible"
      >
        {card && index !== null && (
          <Flex direction="column" align="center" py="3rem" px="0.5rem" gap="1rem">
            <Text
              data-testid="inspector-counter"
              fontSize="0.75rem"
              letterSpacing="0.08em"
              opacity={0.7}
            >
              {index + 1} / {count}
            </Text>

            <Box
              display="grid"
              gridTemplateAreas={{
                base: `"main main" "prev next"`,
                md: `"prev main next"`,
              }}
              gridTemplateColumns={{ base: "1fr 1fr", md: "auto auto auto" }}
              alignItems="center"
              columnGap="1.25rem"
              rowGap="1rem"
              justifyItems="center"
            >
              <NavButton dir="prev" onClick={() => step(-1)} />
              <Flex
                gridArea="main"
                direction={{ base: "column", md: "row" }}
                align={{ base: "center", md: "center" }}
                gap="1.25rem"
                onTouchStart={onTouchStart}
                onTouchEnd={onTouchEnd}
              >
                <Box
                  w={{ base: "min(340px, 68vw)", md: "340px" }}
                  flexShrink={0}
                >
                  <InspectorTilt>
                    <Card card={card} />
                  </InspectorTilt>
                </Box>
                <InfoPanel card={card}>
                  {renderActions?.(card, index)}
                </InfoPanel>
              </Flex>
              <NavButton dir="next" onClick={() => step(1)} />
            </Box>

            <Filmstrip cards={cards} index={index} onJump={onIndexChange} />

            <Text
              display={{ base: "none", md: "block" }}
              fontSize="0.7rem"
              opacity={0.55}
            >
              <Kbd>←</Kbd>
              <Kbd>→</Kbd> flip through · <Kbd>Esc</Kbd> close
            </Text>
          </Flex>
        )}
      </ModalContent>
    </Modal>
  );
};

const Kbd = ({ children }: { children: ReactNode }) => (
  <Box
    as="kbd"
    border="1px solid rgba(255,255,255,0.3)"
    borderRadius="4px"
    px="5px"
    mx="2px"
    fontFamily="inherit"
  >
    {children}
  </Box>
);

const NavButton = ({
  dir,
  onClick,
}: {
  dir: "prev" | "next";
  onClick: () => void;
}) => (
  <IconButton
    gridArea={dir}
    aria-label={dir === "prev" ? "Previous card" : "Next card"}
    icon={<span aria-hidden>{dir === "prev" ? "‹" : "›"}</span>}
    onClick={onClick}
    isRound
    w="44px"
    minW="44px"
    h="44px"
    fontSize="1.5rem"
    color="white"
    bg="rgba(255,255,255,0.08)"
    border="1px solid rgba(255,255,255,0.12)"
    _hover={{ bg: "rgba(255,255,255,0.18)" }}
  />
);

/**
 * Tilt-only frame for the big card: leans toward the cursor (≤ 10° per axis),
 * no zoom. #1575's `CardTilt` (components/CardFactory/CardTilt.tsx) is meant
 * to replace this body once it is on main — the call site only wraps `<Card>`.
 */
const MAX_TILT_DEG = 10;
const InspectorTilt = ({ children }: { children: ReactNode }) => {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") return;
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    setTilt({ x: -py * 2 * MAX_TILT_DEG, y: px * 2 * MAX_TILT_DEG });
  };
  const moving = tilt.x !== 0 || tilt.y !== 0;
  return (
    <Box
      onPointerMove={onMove}
      onPointerLeave={() => setTilt({ x: 0, y: 0 })}
      style={{
        transform: `perspective(900px) rotateX(${tilt.x.toFixed(1)}deg) rotateY(${tilt.y.toFixed(1)}deg)`,
        transition: moving ? "transform 80ms ease-out" : "transform 550ms ease-out",
      }}
      borderRadius="0.6rem"
      boxShadow="0 24px 60px rgba(0,0,0,0.65)"
      sx={{ aspectRatio: "63 / 88" }}
    >
      {children}
    </Box>
  );
};

type RuleBlock = { heading?: string; text: string };

/**
 * The same four fields, in the same order and with the same timing keywords,
 * as the card face (card.helpers `wrap*Text`, card.factory). Schemes only
 * ever show `basicText` on the face, so only that here too.
 */
export const ruleBlocks = (card: DeckImportCardType): RuleBlock[] => {
  const blocks: RuleBlock[] = [];
  const add = (heading: string | undefined, text?: string) => {
    if (text && text.trim()) blocks.push({ heading, text: text.trim() });
  };
  add(undefined, card.basicText);
  if (!cardText.isScheme(card.type)) {
    add("IMMEDIATELY", card.immediateText);
    add("DURING COMBAT", card.duringText);
    add("AFTER COMBAT", card.afterText);
  }
  return blocks;
};

const InfoPanel = ({
  card,
  children,
}: {
  card: DeckImportCardType;
  children?: ReactNode;
}) => {
  const blocks = ruleBlocks(card);
  const isScheme = cardText.isScheme(card.type);
  return (
    <Box
      w={{ base: "min(340px, 92vw)", md: "300px" }}
      bg="brand.surfaceDim"
      border="1px solid rgba(255,255,255,0.08)"
      borderRadius="14px"
      p="1.1rem"
      boxShadow="0 20px 50px rgba(0,0,0,0.5)"
      fontSize="0.85rem"
    >
      <Text
        as="h2"
        fontFamily="BebasNeueRegular"
        fontSize="1.75rem"
        lineHeight="1"
        color="brand.accent"
        fontWeight={400}
      >
        {card.title}
      </Text>
      <Box
        data-testid="inspector-type"
        display="inline-flex"
        mt="0.4rem"
        mb="0.75rem"
        px="9px"
        py="2px"
        borderRadius="999px"
        bg={CARD_TYPE_COLOURS[card.type] ?? "gray.500"}
        color="white"
        fontSize="0.75rem"
        fontWeight={700}
        letterSpacing="0.06em"
        textTransform="uppercase"
      >
        {card.type}
      </Box>

      <Flex gap="0.5rem" mb="0.75rem">
        <Stat label="value" value={isScheme || card.value == null ? "—" : card.value} />
        <Stat label="boost" value={card.boost ?? 0} />
        <Stat label="in deck" value={`×${card.quantity ?? 1}`} />
      </Flex>

      <Box fontSize="0.9rem" lineHeight="1.45" color="#F6EAD3">
        {blocks.length === 0 && <Text opacity={0.6}>No rules text.</Text>}
        {blocks.map((b, i) => (
          <Box key={i} mt={i ? "0.75rem" : 0}>
            {b.heading && (
              <Text
                fontSize="0.75rem"
                fontWeight={700}
                letterSpacing="0.05em"
                color="brand.accent"
              >
                {b.heading}
              </Text>
            )}
            <Text whiteSpace="pre-wrap">{b.text}</Text>
          </Box>
        ))}
      </Box>

      {/* actions slot — see CardInspectorProps.renderActions */}
      {children && <Box data-testid="inspector-actions" mt="1rem">{children}</Box>}
    </Box>
  );
};

const Stat = ({ label, value }: { label: string; value: string | number }) => (
  <Box
    flex="1"
    bg="rgba(255,255,255,0.05)"
    borderRadius="9px"
    py="0.5rem"
    px="0.4rem"
    textAlign="center"
  >
    <Text
      fontFamily="BebasNeueRegular"
      fontSize="1.65rem"
      lineHeight="1"
      color="brand.accent"
    >
      {value}
    </Text>
    <Text fontSize="0.7rem" opacity={0.65} letterSpacing="0.04em" textTransform="uppercase">
      {label}
    </Text>
  </Box>
);

/** Thumbnails of the whole deck (the real `Card` at ~34px, so sprite-sheet and
 * generated faces both work); the current one is ringed in brand.primary. */
const Filmstrip = ({
  cards,
  index,
  onJump,
}: {
  cards: DeckImportCardType[];
  index: number;
  onJump: (i: number) => void;
}) => {
  const currentRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // keep the current thumb in view on a long deck / narrow screen
    currentRef.current?.scrollIntoView?.({ inline: "center", block: "nearest" });
  }, [index]);
  return (
    <Flex
      aria-label="Deck cards"
      gap="6px"
      maxW="100%"
      overflowX="auto"
      py="6px"
      px="4px"
      sx={{ scrollbarWidth: "thin" }}
    >
      {cards.map((c, i) => {
        const current = i === index;
        return (
          <Box
            as="button"
            type="button"
            key={c.title + i}
            ref={current ? currentRef : undefined}
            aria-label={`Card ${i + 1}: ${c.title}`}
            aria-current={current ? "true" : undefined}
            onClick={() => onJump(i)}
            flexShrink={0}
            w="34px"
            borderRadius="4px"
            border="2px solid"
            borderColor={current ? "brand.primary" : "transparent"}
            opacity={current ? 1 : 0.5}
            transition="opacity 0.15s, transform 0.15s"
            _hover={{ opacity: 0.9, transform: "translateY(-2px)" }}
            overflow="hidden"
            sx={{ aspectRatio: "63 / 88" }}
          >
            <Card card={c} />
          </Box>
        );
      })}
    </Flex>
  );
};
