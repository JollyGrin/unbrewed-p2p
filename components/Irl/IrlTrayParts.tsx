import { Box, Flex, Text, chakra } from "@chakra-ui/react";
import {
  AnimatePresence,
  useAnimationControls,
  useReducedMotion,
} from "framer-motion";
import { useEffect, useRef } from "react";
import { IrlCounter } from "@/lib/irl/irlCharacters";
import { colors } from "@/styles/style";
import {
  BEBAS,
  GOLD_GRADIENT,
  GROTESK,
  IconBoot,
  IconBow,
  IconDots,
  IconHeart,
  IconSword,
  MotionDiv,
  MotionSpan,
  PARCHMENT_CHIP,
  Ticker,
} from "./irl.ui";

/**
 * The tray's fixed rows: health counters and the four pile tiles. Sized from
 * the Main mockup (research/irl-mode-2026-09-13/mockups).
 */

// --- motion tuning (#810; #811 moves these into lib/irl/irlMotion.ts) -------
/** Counter border flash: red on −, green on +. Kept under reduced motion. */
const FLASH_MS = 300;
/** Heart beat on damage. */
const HEART_MS = 320;
const HEART_SCALE = 1.35;
/** The once-only wobble when a character hits 0 HP. */
const SHAKE_MS = 360;
const SHAKE_X = [0, -6, 5, -3, 2, 0];
/** Fade into / out of the knocked-out look. */
const KO_MS = 250;
const KO_OPACITY = 0.6;
const KO_FILTER = "grayscale(0.6)";
/** Pile tile bump whenever its count changes. */
const PULSE_MS = 200;
const PULSE_SCALE = 1.06;
/** Pager: the active dot's width, and a new card's dot popping in. */
const DOT_SPRING = { type: "spring", stiffness: 520, damping: 34 } as const;
const DOT_POP = { type: "spring", stiffness: 640, damping: 16 } as const;

/** Calls `react(was, now)` after `value` changes — never on mount. */
const useOnChange = (
  value: number,
  react: (was: number, now: number) => void,
) => {
  const last = useRef(value);
  const latest = useRef(react);
  latest.current = react;
  useEffect(() => {
    if (last.current === value) return;
    const was = last.current;
    last.current = value;
    latest.current(was, value);
  }, [value]);
};

/**
 * A tile's 1 → 1.06 → 1 bump. Reacts to the count itself, not to a click, so
 * anything that moves cards (and #811's card flights landing) pulses it.
 */
const useCountPulse = (count: number) => {
  const reduce = !!useReducedMotion();
  const controls = useAnimationControls();
  useOnChange(count, () => {
    if (reduce) return;
    controls.start({
      scale: [1, PULSE_SCALE, 1],
      transition: { duration: PULSE_MS / 1000, ease: "easeOut" },
    });
  });
  return controls;
};

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
  const reduce = !!useReducedMotion();
  const chip = useAnimationControls();
  const heart = useAnimationControls();
  const knockedOut = isHp && counter.value <= 0;

  useOnChange(counter.value, (was, now) => {
    const flash = now > was ? colors.brand.positive : colors.brand.danger;
    const wasOut = isHp && was <= 0;
    const nowOut = isHp && now <= 0;
    chip.start({
      borderColor: [flash, flash, colors.brand.accent],
      ...(nowOut !== wasOut && {
        opacity: nowOut ? KO_OPACITY : 1,
        filter: nowOut ? KO_FILTER : "grayscale(0)",
      }),
      ...(nowOut && !wasOut && !reduce && { x: SHAKE_X }),
      transition: {
        borderColor: { duration: FLASH_MS / 1000, times: [0, 0.4, 1] },
        opacity: { duration: KO_MS / 1000 },
        filter: { duration: KO_MS / 1000 },
        x: { duration: SHAKE_MS / 1000, ease: "easeOut" },
      },
    });
    if (isHp && now < was && !reduce) {
      heart.start({
        scale: [1, HEART_SCALE, 1],
        transition: { duration: HEART_MS / 1000, ease: "easeOut" },
      });
    }
  });

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
        {isHp && (
          <MotionSpan display="inline-flex" animate={heart}>
            <IconHeart size={compact ? 14 : 18} />
          </MotionSpan>
        )}
        <Text
          as="span"
          fontFamily={BEBAS}
          fontSize={compact ? "28px" : "34px"}
          lineHeight={1}
          color="brand.surfaceDim"
          sx={{ fontVariantNumeric: "tabular-nums" }}
          aria-live="polite"
        >
          <Ticker value={counter.value} />
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
    display: "flex",
    bg: PARCHMENT_CHIP,
    color: "brand.surfaceDim",
    border: "2px solid",
    borderColor: "brand.accent",
    boxShadow: "0 4px 14px rgba(12, 4, 16, 0.45)",
    fontFamily: GROTESK,
    initial: {
      opacity: knockedOut ? KO_OPACITY : 1,
      filter: knockedOut ? KO_FILTER : "grayscale(0)",
    },
    animate: chip,
  };

  if (compact) {
    return (
      <MotionDiv
        {...shell}
        flexDirection="column"
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
      </MotionDiv>
    );
  }

  return (
    <MotionDiv
      {...shell}
      alignItems="center"
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
    </MotionDiv>
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
      <Ticker value={count} />
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
}) => {
  const pulse = useCountPulse(count);
  return (
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
      <MotionSpan {...tileBox(false)} animate={pulse}>
        <TileFace label={label} count={count} sub={sub} />
      </MotionSpan>
      <Box as="span" {...tileStrip}>
        {action}
      </Box>
    </chakra.button>
  );
};

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
}) => {
  const pulse = useCountPulse(count);
  return (
    <Flex direction="column" gap="6px" flex="1 1 0" minW={0}>
      {/* the pulse scales a wrapper: on the button it would pin its inline
          transform and swallow the button's own :active press */}
      <MotionDiv animate={pulse}>
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
      </MotionDiv>
      <chakra.button {...pressableTile} {...tileStrip} onClick={onDraw}>
        Draw
      </chakra.button>
    </Flex>
  );
};

/** The mockup's HAND bar with its dot pager. */
export const HandBar = ({ count, index }: { count: number; index: number }) => {
  const reduce = !!useReducedMotion();
  return (
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
          {/* initial={false}: the dots already there on mount don't pop */}
          <AnimatePresence initial={false}>
            {Array.from({ length: count }, (_, i) => (
              <MotionDiv
                key={i}
                h="6px"
                borderRadius="3px"
                bg={i === index ? "brand.secondary" : "rgba(72, 40, 79, 0.35)"}
                initial={reduce ? false : { width: 6, scale: 0 }}
                // transitions ride inside the targets: on a chakra() element
                // the `transition` prop is Chakra's CSS one
                animate={{
                  width: i === index ? 18 : 6,
                  scale: 1,
                  transition: reduce
                    ? { duration: 0 }
                    : { width: DOT_SPRING, scale: DOT_POP },
                }}
                exit={reduce ? undefined : { width: 0, scale: 0 }}
              />
            ))}
          </AnimatePresence>
        </Flex>
      )}
    </Flex>
  );
};
