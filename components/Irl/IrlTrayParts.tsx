import { Box, Flex, Text, chakra } from "@chakra-ui/react";
import { IrlCounter } from "@/lib/irl/irlCharacters";
import {
  BEBAS,
  GOLD_GRADIENT,
  GROTESK,
  IconBoot,
  IconBow,
  IconDots,
  IconHeart,
  IconSword,
  PARCHMENT_CHIP,
} from "./irl.ui";

/**
 * The tray's fixed rows: health counters and the four pile tiles. Sized from
 * the Main mockup (research/irl-mode-2026-09-13/mockups).
 */

const roundButton = {
  type: "button" as const,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  w: "44px",
  h: "44px",
  borderRadius: "50%",
  fontSize: "26px",
  fontWeight: 700,
  lineHeight: 1,
  cursor: "pointer",
  userSelect: "none" as const,
  _active: { transform: "scale(0.94)" },
  _disabled: { opacity: 0.35, cursor: "not-allowed" },
  sx: { WebkitTapHighlightColor: "transparent", touchAction: "manipulation" },
};

/**
 * One health (or squad-count) counter. Full width while the deck has two
 * characters or fewer (the mockup's chip); a compact two-up card beyond that,
 * so Skeleton King's roster still leaves room for a hand card.
 */
export const CounterChip = ({
  counter,
  compact,
  onAdjust,
}: {
  counter: IrlCounter;
  compact: boolean;
  onAdjust: (delta: number) => void;
}) => {
  const isHp = counter.kind === "hp";
  const minus = (
    <chakra.button
      {...roundButton}
      bg="rgba(255, 99, 71, 0.16)"
      color="brand.danger"
      aria-label={`${counter.name} ${isHp ? "health" : "count"} down`}
      disabled={counter.value <= 0}
      onClick={() => onAdjust(-1)}
    >
      −
    </chakra.button>
  );
  const plus = (
    <chakra.button
      {...roundButton}
      bg="rgba(47, 158, 104, 0.16)"
      color="brand.positive"
      aria-label={`${counter.name} ${isHp ? "health" : "count"} up`}
      onClick={() => onAdjust(1)}
    >
      +
    </chakra.button>
  );
  const value = (
    <Flex direction="column" align="center" w={compact ? "auto" : "52px"} flexShrink={0}>
      <Flex align="center" gap="4px" color={isHp ? "brand.danger" : "brand.surfaceDim"}>
        {isHp && <IconHeart size={compact ? 14 : 18} />}
        <Text
          as="span"
          fontFamily={BEBAS}
          fontSize={compact ? "28px" : "34px"}
          lineHeight={1}
          color="brand.surfaceDim"
          sx={{ fontVariantNumeric: "tabular-nums" }}
          aria-live="polite"
        >
          {counter.value}
        </Text>
      </Flex>
      {counter.start !== null && (
        <Text
          fontSize="9px"
          fontWeight={600}
          letterSpacing="0.08em"
          textTransform="uppercase"
          color="rgba(44, 24, 49, 0.55)"
          whiteSpace="nowrap"
        >
          {isHp ? `start ${counter.start}` : `of ${counter.start}`}
        </Text>
      )}
    </Flex>
  );
  const meta = (
    <Flex
      align="center"
      gap="6px"
      mt="3px"
      fontSize="11px"
      fontWeight={600}
      color="rgba(44, 24, 49, 0.7)"
      minW={0}
    >
      {counter.isRanged ? <IconBow /> : <IconSword />}
      <span>{counter.isRanged ? "Ranged" : "Melee"}</span>
      <Box as="span" opacity={0.4}>
        ·
      </Box>
      {counter.detail.startsWith("move") && <IconBoot />}
      <Box as="span" whiteSpace="nowrap" overflow="hidden" textOverflow="ellipsis">
        {counter.detail.startsWith("move") ? counter.detail.slice(5) : counter.detail}
      </Box>
    </Flex>
  );

  const shell = {
    bg: PARCHMENT_CHIP,
    color: "brand.surfaceDim",
    border: "2px solid",
    borderColor: "brand.accent",
    boxShadow: "0 4px 14px rgba(12, 4, 16, 0.45)",
    fontFamily: GROTESK,
  };

  if (compact) {
    return (
      <Flex
        {...shell}
        direction="column"
        gap="2px"
        borderRadius="16px"
        px="8px"
        py="6px"
        minW={0}
        role="group"
        aria-label={counter.name}
      >
        <Text
          fontFamily={BEBAS}
          fontSize="16px"
          lineHeight={1.1}
          letterSpacing="0.03em"
          textTransform="uppercase"
          textAlign="center"
          whiteSpace="nowrap"
          overflow="hidden"
          textOverflow="ellipsis"
        >
          {counter.name}
        </Text>
        <Flex align="center" justify="space-between" gap="4px">
          {minus}
          {value}
          {plus}
        </Flex>
      </Flex>
    );
  }

  return (
    <Flex
      {...shell}
      align="center"
      gap="8px"
      minH="60px"
      borderRadius="999px"
      p="6px 6px 6px 14px"
      role="group"
      aria-label={counter.name}
    >
      <Flex direction="column" flex="1" minW={0}>
        <Text
          fontFamily={BEBAS}
          fontSize="20px"
          lineHeight={1}
          letterSpacing="0.03em"
          textTransform="uppercase"
          whiteSpace="nowrap"
          overflow="hidden"
          textOverflow="ellipsis"
        >
          {counter.name}
        </Text>
        {meta}
      </Flex>
      {minus}
      {value}
      {plus}
    </Flex>
  );
};

const tileBox = (primary: boolean) => ({
  display: "flex",
  flexDirection: "column" as const,
  alignItems: "center",
  justifyContent: "center",
  gap: "2px",
  minH: "64px",
  w: "100%",
  borderRadius: "12px",
  bg: primary ? GOLD_GRADIENT : PARCHMENT_CHIP,
  color: "brand.surfaceDim",
  border: "1px solid rgba(72, 40, 79, 0.25)",
  boxShadow: "0 2px 6px rgba(20, 8, 24, 0.35)",
  position: "relative" as const,
});

const tileStrip = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minH: "44px",
  w: "100%",
  borderRadius: "8px",
  fontSize: "12px",
  fontWeight: 700,
  color: "brand.parchment",
  bg: "rgba(44, 24, 49, 0.55)",
  border: "1px solid rgba(250, 235, 215, 0.2)",
};

const pressableTile = {
  type: "button" as const,
  cursor: "pointer",
  userSelect: "none" as const,
  fontFamily: GROTESK,
  _active: { transform: "scale(0.98)" },
  sx: { WebkitTapHighlightColor: "transparent", touchAction: "manipulation" },
};

const TileFace = ({
  label,
  count,
  sub,
}: {
  label: string;
  count: number;
  sub?: string;
}) => (
  <>
    <Text
      as="span"
      fontFamily={BEBAS}
      fontSize="30px"
      lineHeight={1}
      sx={{ fontVariantNumeric: "tabular-nums" }}
    >
      {count}
    </Text>
    <Text
      as="span"
      fontSize="10px"
      fontWeight={700}
      letterSpacing="0.1em"
      textTransform="uppercase"
      color="rgba(44, 24, 49, 0.7)"
    >
      {label}
    </Text>
    {sub && (
      <Text as="span" fontSize="9px" fontWeight={600} color="rgba(44, 24, 49, 0.6)">
        {sub}
      </Text>
    )}
  </>
);

/** Characters / Hand / Discard: the whole tile is one "View" button. */
export const PileTile = ({
  label,
  count,
  sub,
  action,
  onClick,
}: {
  label: string;
  count: number;
  sub?: string;
  action: string;
  onClick: () => void;
}) => (
  <chakra.button
    {...pressableTile}
    display="flex"
    flexDirection="column"
    gap="6px"
    flex="1 1 0"
    minW={0}
    aria-label={`${label}: ${count}${sub ? `, ${sub}` : ""}. ${action}`}
    onClick={onClick}
  >
    <Box as="span" {...tileBox(false)}>
      <TileFace label={label} count={count} sub={sub} />
    </Box>
    <Box as="span" {...tileStrip}>
      {action}
    </Box>
  </chakra.button>
);

/**
 * The deck: the strip draws (the mockup's "Draw"), the pile itself opens
 * the deck menu — Draw 2/3, shuffle, scry, mill, look through.
 */
export const DeckTile = ({
  count,
  onDraw,
  onMenu,
}: {
  count: number;
  onDraw: () => void;
  onMenu: () => void;
}) => (
  <Flex direction="column" gap="6px" flex="1 1 0" minW={0}>
    <chakra.button
      {...pressableTile}
      {...tileBox(true)}
      aria-label={`Deck: ${count} cards. More deck actions`}
      onClick={onMenu}
    >
      <Box position="absolute" top="2px" right="6px" opacity={0.6} aria-hidden>
        <IconDots size={14} />
      </Box>
      <TileFace label="Deck" count={count} />
    </chakra.button>
    <chakra.button {...pressableTile} {...tileStrip} onClick={onDraw}>
      Draw
    </chakra.button>
  </Flex>
);

/** The mockup's HAND bar with its dot pager. */
export const HandBar = ({ count, index }: { count: number; index: number }) => (
  <Flex
    align="center"
    justify="space-between"
    px="16px"
    mx="12px"
    mt="10px"
    minH="30px"
    borderRadius="8px"
    bg="brand.highlight"
    color="brand.surfaceDim"
    flexShrink={0}
  >
    <Text fontFamily={BEBAS} fontSize="18px" letterSpacing="0.08em">
      HAND
    </Text>
    {count > 12 ? (
      <Text fontSize="11px" fontWeight={700}>
        {index + 1} / {count}
      </Text>
    ) : (
      <Flex align="center" gap="6px" aria-label={`Card ${index + 1} of ${count}`}>
        {Array.from({ length: count }, (_, i) => (
          <Box
            key={i}
            w={i === index ? "18px" : "6px"}
            h="6px"
            borderRadius="3px"
            bg={i === index ? "brand.secondary" : "rgba(72, 40, 79, 0.35)"}
            transition="width 0.15s ease"
          />
        ))}
      </Flex>
    )}
  </Flex>
);
