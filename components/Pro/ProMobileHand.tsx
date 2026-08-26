/**
 * The mobile hand (issue #708, direction B) — a fan-peek that opens a
 * half-screen drawer.
 *
 * Direction B's rule is that nothing permanent stands on the board, so the hand
 * is not a strip along the bottom edge any more: closed it is three tilted card
 * backs with a count badge, and tapping it opens a drawer holding the WHOLE
 * hand at once. Dean's follow-up pins that last part — prefer wrapping into two
 * rows over making the player scroll, so five to eight cards are all visible
 * together (`handDrawerLayout`); only a genuinely oversized hand falls back to
 * a horizontal scroller.
 *
 * The cards themselves are ProHand's, unchanged: same server-driven
 * affordances, same tap-to-play, same long-press preview.
 */
import { useEffect, useRef } from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import { Action, CardInstanceId } from "@/lib/pro/protocol";
import { ResolveCard } from "@/lib/pro/useProCardArt";
import {
  HAND_CARD_W_RAIL,
  HAND_PEEK_H,
  HAND_DRAWER_CARD_SCROLL,
  HAND_PEEK_CARD_W,
  TAP_TARGET,
  handDrawerLayout,
} from "@/lib/pro/mobileLayout";
import { CardFace, HandCardAction, ProHand } from "@/components/Pro/ProHand";

export interface ProMobileHandProps {
  hand: CardInstanceId[];
  resolveCard: ResolveCard;
  labelFor: (instance: CardInstanceId) => string;
  actionsFor: (instance: CardInstanceId) => HandCardAction[];
  onAction: (action: Action) => void;
  deckCount: number;
  discardCount: number;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}

/**
 * Closed state: the last three cards, tilted, with the hand count badged on
 * top. Real faces rather than a generic back — it is YOUR hand, and the peek
 * doubles as a reminder of what is in it.
 */
export const HandFanPeek = ({
  hand,
  resolveCard,
  labelFor,
  onOpen,
}: Pick<ProMobileHandProps, "hand" | "resolveCard" | "labelFor" | "onOpen">) => {
  const peek = hand.slice(-3);
  const tilt = [-10, -1, 9];
  return (
    <Box
      as="button"
      type="button"
      data-testid="hand-fan-peek"
      aria-label={`Your hand — ${hand.length} card${hand.length === 1 ? "" : "s"}`}
      onClick={onOpen}
      position="relative"
      w="9.4rem"
      // The fan's own box is as tall as the fan, not just the tap strip: the
      // action pills stack ABOVE this lane, and a card must never paint over
      // one of them (Dean, 2026-08-26).
      h={HAND_PEEK_H}
      flexShrink={0}
      pointerEvents="auto"
    >
      {peek.map((instance, i) => (
        <Box
          key={instance}
          position="absolute"
          bottom={0}
          left={`${i * 1.9}rem`}
          w={HAND_PEEK_CARD_W}
          sx={{ aspectRatio: "63 / 88" }}
          transform={`rotate(${tilt[i] ?? 0}deg)`}
          borderRadius="0.45rem"
          overflow="hidden"
          border="2px solid #3A2140"
          boxShadow="0 4px 12px rgba(12, 4, 16, 0.5)"
          // The peek is one tap target: previews and plays belong to the drawer.
          pointerEvents="none"
        >
          <CardFace card={resolveCard(instance)} fallback={labelFor(instance)} />
        </Box>
      ))}
      {hand.length === 0 && (
        <Flex
          position="absolute"
          inset={0}
          alignItems="center"
          justifyContent="center"
          borderRadius="0.75rem"
          bg="rgba(44, 24, 49, 0.88)"
          border="1px solid rgba(250, 235, 215, 0.3)"
          color="brand.parchment"
          fontSize="0.72rem"
        >
          hand is empty
        </Flex>
      )}
      {hand.length > 0 && (
        <Text
          position="absolute"
          top="-0.25rem"
          right="0.2rem"
          bg="brand.accent"
          color="brand.surfaceDim"
          fontFamily="SpaceGrotesk"
          fontWeight={700}
          fontSize="0.8rem"
          lineHeight={1}
          borderRadius="999px"
          px="0.55rem"
          py="0.2rem"
        >
          {hand.length}
        </Text>
      )}
    </Box>
  );
};

/** Open state: the scrim + half-screen drawer holding the whole hand. */
export const HandDrawer = ({
  hand,
  resolveCard,
  labelFor,
  actionsFor,
  onAction,
  deckCount,
  discardCount,
  onClose,
}: Omit<ProMobileHandProps, "isOpen" | "onOpen">) => {
  const { columns, scroll } = handDrawerLayout(hand.length);
  return (
    <>
      {/* The mobile control container the page pins at z 160 is
          `pointer-events: none` so the board stays draggable between its
          buttons — every surface that must actually receive taps turns them
          back on for itself. */}
      <Box
        position="fixed"
        inset={0}
        zIndex={161}
        pointerEvents="auto"
        bg="rgba(30, 15, 34, 0.6)"
        sx={{ backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)" }}
        onClick={onClose}
      />
      <Flex
        data-testid="hand-drawer"
        position="fixed"
        left={0}
        right={0}
        bottom={0}
        zIndex={162}
        pointerEvents="auto"
        maxH="62svh"
        direction="column"
        gap="0.5rem"
        bg="brand.surfaceDim"
        borderTop="2px solid"
        borderColor="brand.accent"
        borderTopRadius="1.1rem"
        px="0.75rem"
        pt="0.5rem"
        pb="1rem"
        sx={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
      >
        {/* Drag handle — a tap target in its own right, so the drawer closes
            without hunting for the scrim. */}
        <Flex
          as="button"
          type="button"
          aria-label="Close hand"
          onClick={onClose}
          alignItems="center"
          justifyContent="center"
          w="100%"
          py="0.35rem"
          flexShrink={0}
        >
          <Box w="2.75rem" h="0.3rem" borderRadius="999px" bg="rgba(250, 235, 215, 0.35)" />
        </Flex>
        <Flex alignItems="center" gap="0.5rem" flexShrink={0}>
          <Text
            fontFamily="BebasNeueRegular"
            fontSize="0.95rem"
            letterSpacing="0.06em"
            color="brand.accent"
          >
            YOUR HAND · {hand.length}
          </Text>
          <Box flex={1} />
          <Text fontSize="0.7rem" color="brand.parchment" opacity={0.7}>
            deck {deckCount} · discard {discardCount}
          </Text>
        </Flex>
        <Box flex="1" minH={0} overflowY="auto" overflowX="hidden">
          <ProHand
            hand={hand}
            resolveCard={resolveCard}
            labelFor={labelFor}
            actionsFor={actionsFor}
            onAction={onAction}
            variant={scroll ? "strip" : "wrap"}
            columns={columns}
            cardWidth={scroll ? HAND_DRAWER_CARD_SCROLL : undefined}
          />
        </Box>
        <Text fontSize="0.7rem" color="brand.parchment" opacity={0.65} textAlign="center" flexShrink={0}>
          tap to play · long-press to read
        </Text>
      </Flex>
    </>
  );
};

/** The landscape rail's compact always-on hand strip. */
export const RailHand = ({
  hand,
  resolveCard,
  labelFor,
  actionsFor,
  onAction,
}: Pick<
  ProMobileHandProps,
  "hand" | "resolveCard" | "labelFor" | "actionsFor" | "onAction"
>) => (
  <Box flexShrink={0}>
    <Text
      fontFamily="BebasNeueRegular"
      fontSize="0.8rem"
      letterSpacing="0.06em"
      color="brand.accent"
      px="0.1rem"
    >
      HAND · {hand.length}
    </Text>
    <ProHand
      hand={hand}
      resolveCard={resolveCard}
      labelFor={labelFor}
      actionsFor={actionsFor}
      onAction={onAction}
      variant="strip"
      cardWidth={HAND_CARD_W_RAIL}
    />
  </Box>
);

/**
 * Opens the drawer when the decision on the table is about a card in the
 * player's hand.
 *
 * Keyed by the PROMPT, not by a boolean: it fires once per question, so a
 * player who closes the drawer to look at the board is not fought by the next
 * snapshot, and the next question opens it again. A component rather than a
 * hook in the page, because the page decides this well past its own early
 * returns and hooks may not live there.
 */
export const HandDecisionWatcher = ({
  promptKey,
  onOpen,
}: {
  /** id of a prompt that names hand cards, or null when none does */
  promptKey: string | null;
  onOpen: () => void;
}) => {
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (promptKey && seen.current !== promptKey) onOpen();
    seen.current = promptKey;
    // `onOpen` is a fresh closure each render; the per-prompt guard is what
    // keeps this from firing on every one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptKey]);
  return null;
};

export const ProMobileHand = (props: ProMobileHandProps) =>
  props.isOpen ? <HandDrawer {...props} /> : <HandFanPeek {...props} />;
