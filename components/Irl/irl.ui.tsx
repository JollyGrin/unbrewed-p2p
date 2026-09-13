import {
  Box,
  Flex,
  HTMLChakraProps,
  Text,
  chakra,
  shouldForwardProp,
} from "@chakra-ui/react";
import {
  AnimatePresence,
  isValidMotionProp,
  motion,
  useIsPresent,
  useReducedMotion,
} from "framer-motion";
import Link from "next/link";
import {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Card } from "@/components/CardFactory/Card";
import { DeckImportCardType } from "@/components/DeckPool/deck-import.type";
import { colors, fonts } from "@/styles/style";

// --- motion tuning (#810; #811 moves these into lib/irl/irlMotion.ts) -------
/** Full-screen sheets slide in from the right / menus slide up. */
export const SHEET_MS = 220;
/** Menu backdrop fade, and the reduced-motion fade for sheets and menus. */
export const FADE_MS = 150;
/** Digit ticker swap. */
export const TICKER_MS = 180;
const EASE_OUT = [0.22, 1, 0.36, 1];
const EASE_IN = [0.55, 0, 1, 0.45];

/**
 * A slide from "100%" keeps its % unit, so at rest framer would leave
 * `translateX(0%) translateZ(0)` behind — a transform on an open sheet makes
 * it the containing block of every fixed sheet nested in it (the boost
 * picker) and pins a compositor layer. Settled means no transform at all.
 */
const noTransformAtRest = (
  { x = 0, y = 0 }: { x?: string | number; y?: string | number },
  generated: string,
) => (parseFloat(String(x)) === 0 && parseFloat(String(y)) === 0 ? "none" : generated);

const motionProps = {
  shouldForwardProp: (prop: string) =>
    isValidMotionProp(prop) || shouldForwardProp(prop),
};
/**
 * Chakra style props on a framer element. Like ProBoard's MotionFlex these
 * are plain elements — no `display: flex` default, and `direction` / `align`
 * are Flex-only shorthands, so spell out `flexDirection` / `alignItems`.
 */
export const MotionDiv = chakra(motion.div, motionProps);
export const MotionSpan = chakra(motion.span, motionProps);

/**
 * IRL Mode atoms (issue #798). Every value here is lifted from the phone
 * mockups' generator (research/irl-mode-2026-09-13/mockups/gen.mjs), which in
 * turn takes the p2p brand tokens and the ProMobileHud button recipes — so the
 * tray reads as the same app as the sandbox HUD and /pro on a phone.
 */

export const IRL_BG =
  "radial-gradient(ellipse at 50% 20%, #5A3263 0%, #48284F 50%, #2C1831 100%)";
export const BEBAS = `BebasNeueRegular, 'LeagueGothic', Impact, sans-serif`;
export const NARROW = fonts.ArchivoNarrow;
export const GROTESK = fonts.SpaceGrotesk;
export const GOLD_GRADIENT = `linear-gradient(180deg, #F0BC48, ${colors.brand.accent})`;
export const PARCHMENT_CHIP = "rgba(250, 235, 215, 0.94)";
export const CARD_RIM = "#f7eadb";
export const TYPE_ATTACK = "#D7282F";
export const TYPE_SCHEME = "#E2C02A";
/** Desktop gets the phone tray, centred. */
export const TRAY_MAX_W = "480px";
export const SAFE_TOP = "max(14px, calc(env(safe-area-inset-top, 0px) + 6px))";
export const SAFE_BOTTOM =
  "max(22px, calc(env(safe-area-inset-bottom, 0px) + 10px))";
/** Card template aspect (card.helpers cardConstants: 63×88). */
export const CARD_ASPECT = 88 / 63;

type ButtonProps = HTMLChakraProps<"button"> & { href?: string };

const pressable: ButtonProps = {
  type: "button",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: GROTESK,
  cursor: "pointer",
  userSelect: "none",
  transition: "transform 0.1s ease, filter 0.15s ease",
  _active: { transform: "scale(0.97)" },
  _disabled: { opacity: 0.4, cursor: "not-allowed", transform: "none" },
  sx: { WebkitTapHighlightColor: "transparent", touchAction: "manipulation" },
};

/** Dark mobile button (ProMobileHud MOBILE_BTN). */
export const DarkButton = (props: ButtonProps) => (
  <chakra.button
    {...pressable}
    gap="6px"
    minH="44px"
    minW="44px"
    px="12px"
    borderRadius="12px"
    color="brand.parchment"
    bg="rgba(44, 24, 49, 0.88)"
    border="1px solid rgba(250, 235, 215, 0.3)"
    fontSize="12px"
    fontWeight={600}
    {...props}
  />
);

/** Parchment pill (the sandbox PileSplitButton). */
export const PillButton = (props: ButtonProps) => (
  <chakra.button
    {...pressable}
    gap="6px"
    minH="44px"
    px="16px"
    borderRadius="160px"
    bg="brand.parchment"
    color="brand.surfaceDim"
    border="1px solid rgba(72, 40, 79, 0.25)"
    boxShadow="0 2px 6px rgba(20, 8, 24, 0.35)"
    fontWeight={700}
    fontSize="14px"
    lineHeight={1.2}
    {...props}
  />
);

/** Gold primary CTA. */
export const GoldButton = (props: ButtonProps) => (
  <chakra.button
    {...pressable}
    gap="8px"
    minH="48px"
    px="18px"
    borderRadius="12px"
    bg={GOLD_GRADIENT}
    color="brand.surfaceDim"
    boxShadow="inset 0 0 0 1px rgba(196, 143, 30, 0.6), 0 4px 14px rgba(12, 4, 16, 0.45)"
    fontWeight={700}
    fontSize="15px"
    {...props}
  />
);

/** Quiet secondary action under the main button rows. */
export const GhostButton = (props: ButtonProps) => (
  <DarkButton
    bg="transparent"
    border="1px dashed rgba(250, 235, 215, 0.28)"
    color="rgba(250, 235, 215, 0.85)"
    {...props}
  />
);

export const TopBar = ({
  title,
  sub,
  onBack,
  backHref,
  backLabel = "Back",
  right,
}: {
  title: string;
  sub?: string;
  onBack?: () => void;
  /** a link back (the tray's → /bag) instead of a close handler */
  backHref?: string;
  backLabel?: string;
  right?: ReactNode;
}) => (
  <Flex align="center" gap="10px" px="12px" pt={SAFE_TOP} pb="8px" flexShrink={0}>
    {backHref ? (
      <DarkButton as={Link} href={backHref} p={0} w="44px" aria-label={backLabel}>
        <IconBack />
      </DarkButton>
    ) : (
      <DarkButton p={0} w="44px" aria-label={backLabel} onClick={onBack}>
        <IconBack />
      </DarkButton>
    )}
    <Flex direction="column" flex="1" minW={0}>
      <Text
        as="h1"
        fontFamily={BEBAS}
        fontSize="24px"
        lineHeight={1}
        letterSpacing="0.03em"
        color="brand.primary"
        textTransform="uppercase"
        whiteSpace="nowrap"
        overflow="hidden"
        textOverflow="ellipsis"
      >
        {title}
      </Text>
      {sub && (
        <Text
          fontSize="10px"
          fontWeight={600}
          letterSpacing="0.12em"
          textTransform="uppercase"
          color="rgba(231, 204, 152, 0.55)"
          mt="4px"
          whiteSpace="nowrap"
          overflow="hidden"
          textOverflow="ellipsis"
        >
          {sub}
        </Text>
      )}
    </Flex>
    {right}
  </Flex>
);

export const CloseButton = ({
  onClick,
  label = "Close",
}: {
  onClick: () => void;
  label?: string;
}) => (
  <DarkButton p={0} w="44px" aria-label={label} onClick={onClick}>
    <IconClose />
  </DarkButton>
);

/**
 * Full-screen sheet over the tray. Deliberately not a Chakra Modal: sheets
 * stack (Hand grid → Card view), share the tray's background, and a Modal's
 * focus lock fights the swipe handlers on touch.
 *
 * Slides in from the right on plain mount; the slide back out only plays
 * when a parent `AnimatePresence` keeps it mounted for its exit (IrlShell's
 * sheets do — the card view closes instantly).
 */
export const IrlSheet = ({
  label,
  children,
  zIndex = 1000,
  maxW = TRAY_MAX_W,
}: {
  label: string;
  children: ReactNode;
  zIndex?: number;
  maxW?: string;
}) => {
  const reduce = !!useReducedMotion();
  // a sheet sliding away must not take the taps meant for the tray under it
  const present = useIsPresent();
  const ms = (reduce ? FADE_MS : SHEET_MS) / 1000;
  return (
    <MotionDiv
      role="dialog"
      aria-modal="true"
      aria-label={label}
      display="flex"
      position="fixed"
      top={0}
      left={0}
      right={0}
      h="100svh"
      zIndex={zIndex}
      bg={IRL_BG}
      color="brand.parchment"
      fontFamily={GROTESK}
      boxShadow="-12px 0 32px rgba(12, 4, 16, 0.45)"
      pointerEvents={present ? undefined : "none"}
      transformTemplate={noTransformAtRest}
      initial={reduce ? { opacity: 0 } : { x: "100%" }}
      animate={
        reduce
          ? { opacity: 1, transition: { duration: ms } }
          : { x: 0, transition: { duration: ms, ease: EASE_OUT } }
      }
      exit={
        reduce
          ? { opacity: 0, transition: { duration: ms } }
          : { x: "100%", transition: { duration: ms, ease: EASE_IN } }
      }
    >
      <Flex direction="column" w="100%" maxW={maxW} mx="auto" minH={0}>
        {children}
      </Flex>
    </MotionDiv>
  );
};

export type SheetAction = {
  id: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  tone?: "danger";
};

type ActionSheetProps = {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  actions: SheetAction[];
};

/**
 * Bottom action sheet — the long-press / ⋯ menus. The backdrop fades while
 * the panel slides up; closing plays both in reverse before unmounting.
 */
export const ActionSheet = ({ isOpen, ...props }: ActionSheetProps) => (
  <AnimatePresence>
    {isOpen && <ActionSheetPanel key="sheet" {...props} />}
  </AnimatePresence>
);

const ActionSheetPanel = ({
  title,
  onClose,
  actions,
}: Omit<ActionSheetProps, "isOpen">) => {
  const reduce = !!useReducedMotion();
  // closing: the menu's buttons must not fire twice while it slides away
  const present = useIsPresent();
  const fade = { duration: FADE_MS / 1000 };
  return (
    <Box
      position="fixed"
      inset={0}
      zIndex={1100}
      pointerEvents={present ? undefined : "none"}
    >
      {/* sibling, not parent, of the panel — its fade must not fade the panel */}
      <MotionDiv
        position="absolute"
        inset={0}
        bg="rgba(20, 8, 24, 0.55)"
        backdropFilter="blur(4px)"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: fade }}
        exit={{ opacity: 0, transition: fade }}
      />
      <MotionDiv
        role="dialog"
        aria-modal="true"
        aria-label={title}
        display="flex"
        flexDirection="column"
        gap="8px"
        position="absolute"
        left={0}
        right={0}
        bottom={0}
        mx="auto"
        maxW={TRAY_MAX_W}
        maxH="85svh"
        overflowY="auto"
        bg="brand.surfaceDim"
        borderTopRadius="16px"
        border="1px solid rgba(250, 235, 215, 0.18)"
        boxShadow="0 -8px 24px rgba(12, 4, 16, 0.5)"
        px="12px"
        pt="12px"
        pb={SAFE_BOTTOM}
        fontFamily={GROTESK}
        transformTemplate={noTransformAtRest}
        initial={reduce ? { opacity: 0 } : { y: "100%" }}
        animate={
          reduce
            ? { opacity: 1, transition: fade }
            : { y: 0, transition: { duration: SHEET_MS / 1000, ease: EASE_OUT } }
        }
        exit={
          reduce
            ? { opacity: 0, transition: fade }
            : { y: "100%", transition: { duration: SHEET_MS / 1000, ease: EASE_IN } }
        }
      >
        <Text
          fontFamily={BEBAS}
          fontSize="20px"
          letterSpacing="0.03em"
          color="brand.primary"
          px="4px"
          textTransform="uppercase"
          whiteSpace="nowrap"
          overflow="hidden"
          textOverflow="ellipsis"
        >
          {title}
        </Text>
        {actions.map((action) => (
          <DarkButton
            key={action.id}
            minH="48px"
            justifyContent="flex-start"
            gap="10px"
            px="14px"
            fontSize="14px"
            disabled={action.disabled}
            {...(action.tone === "danger"
              ? {
                  bg: "rgba(255, 99, 71, 0.9)",
                  borderColor: "rgba(255, 99, 71, 0.9)",
                }
              : {})}
            onClick={() => {
              onClose();
              action.onSelect();
            }}
          >
            {action.icon}
            <span>{action.label}</span>
          </DarkButton>
        ))}
        <PillButton mt="4px" onClick={onClose}>
          Cancel
        </PillButton>
      </MotionDiv>
    </Box>
  );
};

type TickDir = 1 | -1;
const tickerVariants = {
  // up: the new number rises in from below; down mirrors it
  enter: (dir: TickDir) => ({ y: dir > 0 ? "100%" : "-100%" }),
  shown: { y: "0%" },
  leave: (dir: TickDir) => ({ y: dir > 0 ? "-100%" : "100%" }),
};

/**
 * A number that ticks: the old value slides out as the new one slides in,
 * upward on an increase and downward on a decrease. Takes its font from the
 * parent. Under reduced motion the digits just swap.
 */
export const Ticker = ({ value }: { value: number }) => {
  const reduce = !!useReducedMotion();
  const [last, setLast] = useState(value);
  const [dir, setDir] = useState<TickDir>(1);
  if (value !== last) {
    setLast(value);
    setDir(value > last ? 1 : -1);
  }
  return (
    <chakra.span
      display="inline-grid"
      overflow="hidden"
      verticalAlign="bottom"
      data-testid="irl-ticker"
    >
      {reduce ? (
        <span>{value}</span>
      ) : (
        <AnimatePresence initial={false} custom={dir}>
          <TickerValue key={value} value={value} dir={dir} />
        </AnimatePresence>
      )}
    </chakra.span>
  );
};

const TickerValue = ({ value, dir }: { value: number; dir: TickDir }) => {
  const present = useIsPresent();
  return (
    <motion.span
      custom={dir}
      variants={tickerVariants}
      initial="enter"
      animate="shown"
      exit="leave"
      transition={{ duration: TICKER_MS / 1000, ease: EASE_OUT }}
      style={{ gridArea: "1 / 1" }}
      // the outgoing number is on its way out, not a second value
      aria-hidden={present ? undefined : true}
    >
      {value}
    </motion.span>
  );
};

/** A rendered card at a fixed width; the SVG template sizes itself 63×88. */
export const CardFace = ({
  card,
  width,
}: {
  card: DeckImportCardType;
  width: number | string;
}) => (
  <Box
    w={typeof width === "number" ? `${width}px` : width}
    flexShrink={0}
    lineHeight={0}
    filter="drop-shadow(0 2px 8px rgba(44, 24, 49, 0.35))"
  >
    <Card card={card} />
  </Box>
);

/** Dashed empty-state box (mockup: "No extra rule cards in this deck"). */
export const EmptyNote = ({ children }: { children: ReactNode }) => (
  <Flex
    align="center"
    justify="center"
    textAlign="center"
    w="100%"
    p="10px"
    borderRadius="12px"
    border="1px dashed rgba(250, 235, 215, 0.3)"
    color="rgba(231, 204, 152, 0.6)"
    fontSize="12px"
  >
    {children}
  </Flex>
);

/** Width/height of an element, tracked with a ResizeObserver. */
export const useElementSize = <T extends HTMLElement>() => {
  const [element, setElement] = useState<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!element) return;
    const measure = () =>
      setSize({ width: element.clientWidth, height: element.clientHeight });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return [setElement, size] as const;
};

/**
 * Tap / swipe / long-press on one element, from pointer events so mouse and
 * touch share a path. Needs `touch-action: pan-y` on the element so the
 * browser hands horizontal drags to us instead of scrolling.
 *
 * `onDrag` / `onDragEnd` are for drag-follow (the tray's hand carousel):
 * `onDrag` gets the live horizontal offset on every move, and `onDragEnd`
 * gets the final offset and fling velocity (px/s) once the pointer lifts —
 * also after a tap, a long-press or a cancelled gesture, so the follower
 * can always settle.
 */
export const useSwipe = ({
  onSwipeLeft,
  onSwipeRight,
  onTap,
  onLongPress,
  onDrag,
  onDragEnd,
}: {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onTap?: () => void;
  onLongPress?: () => void;
  onDrag?: (dx: number) => void;
  onDragEnd?: (dx: number, velocityX: number) => void;
}) => {
  const start = useRef<{ x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const pressed = useRef(false);
  /** recent pointer x samples, for the release velocity */
  const trail = useRef<{ x: number; t: number }[]>([]);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = undefined;
  }, []);
  useEffect(() => clear, [clear]);

  const velocity = () => {
    const samples = trail.current;
    if (samples.length < 2) return 0;
    const first = samples[0];
    const last = samples[samples.length - 1];
    const dt = last.t - first.t;
    return dt > 0 ? ((last.x - first.x) / dt) * 1000 : 0;
  };
  const sample = (x: number) => {
    const t = performance.now();
    trail.current = [...trail.current.filter((s) => t - s.t < 100), { x, t }];
  };

  return {
    onPointerDown: (e: ReactPointerEvent) => {
      if (e.button !== 0) return;
      start.current = { x: e.clientX, y: e.clientY };
      pressed.current = false;
      trail.current = [];
      sample(e.clientX);
      clear();
      // a mouse drag that outruns the element keeps reporting to it
      if (onDrag) e.currentTarget.setPointerCapture?.(e.pointerId);
      if (onLongPress) {
        timer.current = setTimeout(() => {
          pressed.current = true;
          onLongPress();
        }, 550);
      }
    },
    onPointerMove: (e: ReactPointerEvent) => {
      if (!start.current) return;
      const dx = e.clientX - start.current.x;
      const dy = e.clientY - start.current.y;
      if (Math.hypot(dx, dy) > 10) clear();
      if (onDrag && !pressed.current) {
        sample(e.clientX);
        onDrag(dx);
      }
    },
    onPointerUp: (e: ReactPointerEvent) => {
      clear();
      const from = start.current;
      start.current = null;
      if (!from) return;
      const dx = e.clientX - from.x;
      const dy = e.clientY - from.y;
      if (onDragEnd) {
        sample(e.clientX);
        const horizontal = !pressed.current && Math.abs(dx) > Math.abs(dy);
        onDragEnd(horizontal ? dx : 0, horizontal ? velocity() : 0);
      }
      if (pressed.current) return;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) onSwipeLeft?.();
        else onSwipeRight?.();
      } else if (Math.hypot(dx, dy) < 10) {
        onTap?.();
      }
    },
    onPointerCancel: () => {
      clear();
      // the browser took the gesture (a vertical scroll): settle back
      if (start.current) onDragEnd?.(0, 0);
      start.current = null;
    },
    onContextMenu: (e: ReactMouseEvent) => {
      if (onLongPress) e.preventDefault();
    },
  };
};

// --- icons (the mockup set, 24-unit strokes) --------------------------------

const Svg = ({
  size = 18,
  filled = false,
  strokeWidth = 2,
  children,
}: {
  size?: number;
  filled?: boolean;
  strokeWidth?: number;
  children: ReactNode;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={filled ? "currentColor" : "none"}
    stroke={filled ? "none" : "currentColor"}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {children}
  </svg>
);

type IconProps = { size?: number };

export const IconBack = ({ size = 22 }: IconProps) => (
  <Svg size={size}>
    <path d="M15 6l-6 6 6 6" />
  </Svg>
);
export const IconHeart = ({ size = 18 }: IconProps) => (
  <Svg size={size} filled>
    <path d="M12 21s-7-4.6-9.3-9.2C1 8.3 3.2 5 6.6 5c1.9 0 3.4 1 4.4 2.4C12 6 13.5 5 15.4 5 18.8 5 21 8.3 20.3 11.8 18 16.4 12 21 12 21z" />
  </Svg>
);
export const IconSword = ({ size = 14 }: IconProps) => (
  <Svg size={size}>
    <path d="M14.5 17.5 3 6V3h3l11.5 11.5" />
    <path d="M13 19l6-6" />
    <path d="M16 16l4 4" />
    <path d="M19 21l2-2" />
  </Svg>
);
export const IconBow = ({ size = 14 }: IconProps) => (
  <Svg size={size}>
    <path d="M5 3c7 2 11 8 12 16" />
    <path d="M5 3l12 16" />
    <path d="M13 3h5v5" />
    <path d="M18 3 9 12" />
  </Svg>
);
export const IconBoot = ({ size = 14 }: IconProps) => (
  <Svg size={size}>
    <path d="M4 19h16" />
    <path d="M6 19V5h6v6h5l3 5v3" />
  </Svg>
);
export const IconDots = ({ size = 20 }: IconProps) => (
  <Svg size={size} filled>
    <circle cx="5" cy="12" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="19" cy="12" r="2" />
  </Svg>
);
export const IconGrid = ({ size = 18 }: IconProps) => (
  <Svg size={size}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </Svg>
);
export const IconToTop = ({ size = 18 }: IconProps) => (
  <Svg size={size}>
    <path d="M12 19V7" />
    <path d="M6 13l6-6 6 6" />
    <path d="M5 4h14" />
  </Svg>
);
export const IconToBottom = ({ size = 18 }: IconProps) => (
  <Svg size={size}>
    <path d="M12 5v12" />
    <path d="M6 11l6 6 6-6" />
    <path d="M5 20h14" />
  </Svg>
);
export const IconTrash = ({ size = 18 }: IconProps) => (
  <Svg size={size}>
    <path d="M4 7h16" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M6 7l1 13h10l1-13" />
    <path d="M9 7V4h6v3" />
  </Svg>
);
export const IconEye = ({ size = 20 }: IconProps) => (
  <Svg size={size}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);
export const IconEyeOff = ({ size = 20 }: IconProps) => (
  <Svg size={size}>
    <path d="M3 3l18 18" />
    <path d="M10.6 10.6a3 3 0 0 0 4.2 4.2" />
    <path d="M9.9 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1" />
    <path d="M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7c1.4 0 2.7-.3 3.9-.8" />
  </Svg>
);
export const IconUndo = ({ size = 18 }: IconProps) => (
  <Svg size={size}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
  </Svg>
);
export const IconBolt = ({ size = 18 }: IconProps) => (
  <Svg size={size}>
    <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
  </Svg>
);
export const IconShuffle = ({ size = 18 }: IconProps) => (
  <Svg size={size}>
    <path d="M3 6h4l10 12h4" />
    <path d="M3 18h4l10-12h4" />
    <path d="M18 3l3 3-3 3" />
    <path d="M18 15l3 3-3 3" />
  </Svg>
);
export const IconHand = ({ size = 18 }: IconProps) => (
  <Svg size={size}>
    <path d="M8 13V5a2 2 0 0 1 4 0v7" />
    <path d="M12 12V4a2 2 0 0 1 4 0v8" />
    <path d="M16 12V6a2 2 0 0 1 4 0v8a7 7 0 0 1-7 7h-1a7 7 0 0 1-6-3.3L3 13a2 2 0 0 1 3.4-2L8 13" />
  </Svg>
);
export const IconClose = ({ size = 20 }: IconProps) => (
  <Svg size={size} strokeWidth={2.2}>
    <path d="M6 6l12 12" />
    <path d="M18 6 6 18" />
  </Svg>
);
export const IconBan = ({ size = 18 }: IconProps) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="9" />
    <path d="M5.6 5.6l12.8 12.8" />
  </Svg>
);
