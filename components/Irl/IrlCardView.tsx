import { Box, Flex, Text } from "@chakra-ui/react";
import { ReactNode, useEffect, useRef, useState } from "react";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { CardBack } from "@/components/CardFactory/card.back";
import { irlAnchor } from "@/lib/irl/irlAnchors";
import { boostChoices, boostTotal, inPlayBoosts } from "@/lib/irl/irlPool";
import {
  IRL_MOTION,
  useIrlFxPause,
  useIrlReducedMotion,
} from "@/lib/irl/irlMotion";
import { IrlHandGrid } from "./IrlHandGrid";
import { useIrlActions, useIrlGame } from "./irlGame";
import {
  BEBAS,
  CARD_ASPECT,
  CardFace,
  CloseButton,
  DarkButton,
  GhostButton,
  GoldButton,
  IconBan,
  IconBolt,
  IconEye,
  IconEyeOff,
  IconHand,
  IconToBottom,
  IconToTop,
  IconTrash,
  IconUndo,
  IrlSheet,
  SAFE_BOTTOM,
  TopBar,
  useElementSize,
  useSwipe,
} from "./irl.ui";

export type CardViewMode = { kind: "hand"; index: number } | { kind: "play" };

/**
 * Card view (issue #798 §3). Two faces:
 * - a HAND card, large, with Play / Top / Bottom / Discard / Remove;
 * - the card IN PLAY (`pool.commit`) — the paper combat loop: committed
 *   face-down, Reveal (swipe or tap), then Discard both or take it back. A
 *   boost is a card FROM HAND (rules §5.4), and only when a card grants one,
 *   so "Boost from hand" sits in the quiet row and opens the hand picker.
 */
export const IrlCardView = ({
  mode,
  onMode,
  onClose,
}: {
  mode: CardViewMode;
  onMode: (mode: CardViewMode) => void;
  onClose: () => void;
}) =>
  mode.kind === "hand" ? (
    <HandCardView
      index={mode.index}
      onIndex={(index) => onMode({ kind: "hand", index })}
      onPlayed={() => onMode({ kind: "play" })}
      onClose={onClose}
    />
  ) : (
    <InPlayView onClose={onClose} />
  );

/** Largest card that fits the free area (and never wider than `max`). */
const fitCard = (
  size: { width: number; height: number },
  reserveW: number,
  reserveH: number,
  max: number,
) =>
  Math.max(
    96,
    Math.min(max, size.width - reserveW, (size.height - reserveH) / CARD_ASPECT),
  );

const HandCardView = ({
  index,
  onIndex,
  onPlayed,
  onClose,
}: {
  index: number;
  onIndex: (index: number) => void;
  onPlayed: () => void;
  onClose: () => void;
}) => {
  const { pool } = useIrlGame();
  const actions = useIrlActions();
  const [area, size] = useElementSize<HTMLDivElement>();
  const hand = pool?.hand ?? [];
  const card = hand[index];
  const inPlay = !!pool?.commit?.main;

  const prev = () => index > 0 && onIndex(index - 1);
  const next = () => index < hand.length - 1 && onIndex(index + 1);
  const swipe = useSwipe({ onSwipeLeft: next, onSwipeRight: prev });

  useEffect(() => {
    if (!card) onClose();
  }, [card, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!card) return null;
  const width = fitCard(size, 24, 16, 320);
  // every action here moves the card out of the hand, so the view closes
  const then = (run: () => void) => () => {
    run();
    onClose();
  };

  return (
    <IrlSheet label={`${card.title} — card view`} zIndex={1050}>
      <TopBar
        title={card.title}
        sub={`Hand · card ${index + 1} of ${hand.length}`}
        onBack={onClose}
        right={<CloseButton onClick={onClose} />}
      />
      <Flex ref={area} flex="1" minH={0} align="center" justify="center" px="12px">
        {/* the card being looked at is "the hand card" a flight leaves from */}
        <Box {...swipe} {...irlAnchor("hand-card")} sx={{ touchAction: "pan-y" }} cursor="grab">
          <CardFace card={card} width={width} />
        </Box>
      </Flex>
      <Flex direction="column" gap="10px" px="12px" pt="10px" pb={SAFE_BOTTOM} flexShrink={0}>
        <GoldButton
          disabled={inPlay}
          onClick={() => {
            actions.play(index);
            onPlayed();
          }}
        >
          <IconHand />
          <span>{inPlay ? "A card is already in play" : "Play this card"}</span>
        </GoldButton>
        <Flex gap="8px">
          <DarkButton flex="1" minH="48px" onClick={then(() => actions.toDeckTop(index))}>
            <IconToTop />
            <span>Top of deck</span>
          </DarkButton>
          <DarkButton flex="1" minH="48px" onClick={then(() => actions.toDeckBottom(index))}>
            <IconToBottom />
            <span>Bottom</span>
          </DarkButton>
          <DarkButton
            flex="1"
            minH="48px"
            bg="rgba(255, 99, 71, 0.9)"
            borderColor="rgba(255, 99, 71, 0.9)"
            onClick={then(() => actions.discard(index))}
          >
            <IconTrash />
            <span>Discard</span>
          </DarkButton>
        </Flex>
        <GhostButton onClick={then(() => actions.removeFromHand(index))}>
          <IconBan size={16} />
          <span>Remove from game</span>
        </GhostButton>
      </Flex>
    </IrlSheet>
  );
};

// --- the reveal (issue #809) ------------------------------------------------

/** iOS Safari ignores the unprefixed property */
const BACKFACE_HIDDEN = {
  backfaceVisibility: "hidden",
  WebkitBackfaceVisibility: "hidden",
} as const;

/**
 * One card with both faces mounted, turned over on Y between them. The
 * `initial={false}` is what keeps a mount still: opening the view on a card
 * that is already face-up (or reloading mid-reveal) shows that face as is.
 * Reduced motion swaps the turn for a crossfade.
 */
const FlipCard = ({
  revealed,
  width,
  back,
  face,
  delay,
  hold,
  reduced,
}: {
  revealed: boolean;
  width: number;
  back: ReactNode;
  face: ReactNode;
  /** seconds after the toggle this card starts to turn */
  delay: number;
  /** dev `?fxPause`: hold the turn at this fraction of its travel */
  hold: number | null;
  reduced: boolean;
}) => {
  const { flip, fade } = IRL_MOTION;
  const size = { w: `${width}px`, h: `${width * CARD_ASPECT}px` };
  const faceLayer = { position: "absolute", top: 0, left: 0 } as const;

  if (reduced) {
    const crossfade = { duration: fade.dur };
    return (
      <Box position="relative" {...size}>
        <motion.div
          initial={false}
          animate={{ opacity: revealed ? 0 : 1 }}
          transition={crossfade}
          aria-hidden={revealed}
        >
          {back}
        </motion.div>
        <motion.div
          initial={false}
          animate={{ opacity: revealed ? 1 : 0 }}
          transition={crossfade}
          style={faceLayer}
          aria-hidden={!revealed}
        >
          {face}
        </motion.div>
      </Box>
    );
  }

  const from = revealed ? 0 : 180;
  const to = revealed ? 180 : 0;
  return (
    <Box position="relative" {...size} sx={{ perspective: `${Math.round(width * 4)}px` }}>
      <motion.div
        initial={false}
        animate={{ rotateY: hold === null ? to : from + (to - from) * hold }}
        transition={{ type: "spring", duration: flip.dur, bounce: flip.bounce, delay }}
        style={{ position: "relative", width: "100%", height: "100%", transformStyle: "preserve-3d" }}
      >
        <div style={{ ...BACKFACE_HIDDEN, transform: "rotateY(0deg)" }} aria-hidden={revealed}>
          {back}
        </div>
        <div
          style={{ ...BACKFACE_HIDDEN, ...faceLayer, transform: "rotateY(180deg)" }}
          aria-hidden={!revealed}
        >
          {face}
        </div>
      </motion.div>
    </Box>
  );
};

/**
 * Pop in once the turn lands — or, mounted on a card that was already up,
 * just be there. Keyed by the reveal it belongs to, so each reveal replays it.
 */
const Landing = ({
  punch,
  delay,
  scaleFrom,
  duration,
  hold,
  reduced,
  children,
}: {
  /** false = no reveal happened while mounted: render still */
  punch: boolean;
  delay: number;
  scaleFrom: number;
  duration: number;
  hold: boolean;
  reduced: boolean;
  children: ReactNode;
}) => {
  // reduced motion: nothing scales, it only fades in
  const from = { opacity: 0, scale: reduced ? 1 : scaleFrom };
  return (
    <motion.div
      initial={punch ? from : false}
      animate={punch && hold ? from : { opacity: 1, scale: 1 }}
      transition={
        reduced
          ? { duration: IRL_MOTION.fade.dur }
          : { duration, delay, ease: "easeOut" }
      }
    >
      {children}
    </motion.div>
  );
};

/**
 * The Total figure. On a fresh reveal with a boost it counts up from the
 * printed value to the boosted one while the row punches in; any later change
 * (a boost added face-up) just shows the new sum.
 */
const TotalCount = ({
  printed,
  sum,
  countUp,
  delay,
}: {
  printed: number;
  sum: number;
  countUp: boolean;
  delay: number;
}) => {
  const count = useMotionValue(countUp ? printed : sum);
  const shown = useTransform(count, (v) => Math.round(v));
  // the one count-up this mount owes; strict-mode safe (a re-run restarts it)
  const owed = useRef<number | null>(countUp ? sum : null);

  useEffect(() => {
    if (owed.current !== sum) {
      owed.current = null;
      count.set(sum);
      return;
    }
    count.set(printed);
    const controls = animate(count, sum, {
      duration: IRL_MOTION.punch.dur,
      delay,
      ease: "easeOut",
      onComplete: () => {
        owed.current = null;
      },
    });
    return () => controls.stop();
    // `printed` / `delay` are fixed for this mount — only `sum` moves
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sum]);

  return <motion.span>{shown}</motion.span>;
};

const quiet = { flex: "1 1 0", px: "8px", fontSize: "11px", lineHeight: 1.15 };

/** The in-play card's width, face-down or up — it must not change mid-turn. */
const IN_PLAY_MAX_W = 236;

const InPlayView = ({ onClose }: { onClose: () => void }) => {
  const { pool } = useIrlGame();
  const actions = useIrlActions();
  const [area, size] = useElementSize<HTMLDivElement>();
  const [picking, setPicking] = useState(false);
  const reduced = useIrlReducedMotion();
  const pause = useIrlFxPause();
  const main = pool?.commit?.main;
  const boosts = inPlayBoosts(pool);
  const revealed = !!pool?.commit?.reveal;
  // Swipe the card to hide/show it, as in Unlimited Decks — so it can be
  // re-hidden before the phone is passed across the table.
  const swipe = useSwipe({
    onSwipeLeft: actions.toggleReveal,
    onSwipeRight: actions.toggleReveal,
  });
  const [hint, setHint] = useState(true);

  // Turns seen while this view is open. Counted during render (not in an
  // effect) so the frame that flips the card is the same one that arms the
  // Total punch — mounting on a face-up card counts nothing, so it sits still.
  const [seen, setSeen] = useState(revealed);
  const [turns, setTurns] = useState({ any: 0, reveals: 0 });
  if (seen !== revealed) {
    setSeen(revealed);
    setTurns((t) => ({ any: t.any + 1, reveals: t.reveals + (revealed ? 1 : 0) }));
  }
  const hold = pause !== null && turns.any > 0 ? pause : null;

  useEffect(() => {
    if (!main) onClose();
  }, [main, onClose]);

  // Escape backs out of the boost picker only, not the whole card view.
  useEffect(() => {
    if (!picking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      setPicking(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [picking]);

  if (!main || !pool) return null;

  const { flip, punch, fade } = IRL_MOTION;
  const total = boostTotal(pool);
  const canBoost = boostChoices(pool).length > 0;
  const boostW = boosts.length > 2 ? 56 : boosts.length > 1 ? 72 : 96;
  const width = fitCard(size, 24 + (boosts.length ? boostW + 10 : 0), 80, IN_PLAY_MAX_W);
  const height = width * CARD_ASPECT;
  const value = typeof main.value === "number" ? main.value : null;
  const plural = boosts.length === 1 ? "" : "s";
  const sub = revealed
    ? `revealed${boosts.length ? ` · boosted +${total}` : ""}`
    : `committed · face-down${boosts.length ? ` · ${boosts.length} boost${plural}` : ""}`;
  const then = (run: () => void) => () => {
    run();
    onClose();
  };

  // main card first, each boost one stagger after the last; the Total lands
  // with the last card, the boost pill as the last boost shows its face
  const stagger = reduced ? 0 : flip.stagger;
  const landAt = reduced ? 0 : flip.dur + boosts.length * stagger;
  const pillAt = reduced ? 0 : boosts.length * stagger + flip.dur / 2;
  const punching = turns.reveals > 0;

  return (
    <IrlSheet label="Card in play" zIndex={1060}>
      <TopBar
        title="In play"
        sub={sub}
        onBack={onClose}
        backLabel="Back to the tray"
        right={<CloseButton onClick={onClose} />}
      />
      <Flex
        ref={area}
        direction="column"
        align="center"
        justify="center"
        gap="14px"
        flex="1"
        minH={0}
        px="12px"
      >
        {/* faded rather than unmounted on reveal, so the card doesn't jump
            while it turns */}
        {hint && (
          <motion.div
            initial={false}
            animate={{ opacity: revealed ? 0 : 1 }}
            transition={{ duration: fade.dur }}
            style={{ pointerEvents: revealed ? "none" : undefined }}
            aria-hidden={revealed}
          >
            <Flex
              align="center"
              gap="8px"
              fontSize="12px"
              fontWeight={600}
              color="rgba(231, 204, 152, 0.7)"
              onClick={() => setHint(false)}
            >
              <IconEyeOff />
              <span>Hidden. Flip when both players reveal.</span>
            </Flex>
          </motion.div>
        )}
        <Flex align="flex-end" gap="10px">
          <Box
            {...swipe}
            {...irlAnchor("in-play-card")}
            sx={{ touchAction: "pan-y" }}
            cursor="grab"
            aria-label={revealed ? main.title : "Face-down card"}
          >
            <FlipCard
              revealed={revealed}
              width={width}
              delay={0}
              hold={hold}
              reduced={reduced}
              back={<CardBack width={`${width}px`} height={`${height}px`} imageUrl={main.cardBackUrl} />}
              face={<CardFace card={main} width={width} />}
            />
          </Box>
          {boosts.length > 0 && (
            <Flex direction="column" align="center" gap="6px">
              {boosts.map((boost, i) => (
                <Box
                  key={`${boost.title}-${i}`}
                  {...irlAnchor(`boost-slot-${i}`)}
                  aria-label={revealed ? `Boost: ${boost.title}` : "Face-down boost"}
                >
                  {/* the boost stays hidden while the card it boosts is hidden */}
                  <FlipCard
                    revealed={revealed}
                    width={boostW}
                    delay={(i + 1) * stagger}
                    hold={hold}
                    reduced={reduced}
                    back={
                      <CardBack
                        width={`${boostW}px`}
                        height={`${boostW * CARD_ASPECT}px`}
                        imageUrl={boost.cardBackUrl}
                      />
                    }
                    face={
                      <Box position="relative">
                        <CardFace card={boost} width={boostW} />
                        <Box position="absolute" inset={0} borderRadius="4px" bg="rgba(44, 24, 49, 0.35)" />
                      </Box>
                    }
                  />
                </Box>
              ))}
              <Landing
                key={`pill-${turns.reveals}`}
                punch={punching && revealed}
                delay={pillAt}
                scaleFrom={0.6}
                duration={punch.dur}
                hold={hold !== null}
                reduced={reduced}
              >
                <Flex
                  align="center"
                  gap="4px"
                  px="10px"
                  py="4px"
                  borderRadius="999px"
                  bg="brand.accent"
                  color="brand.surfaceDim"
                  fontSize="12px"
                  fontWeight={700}
                  whiteSpace="nowrap"
                >
                  <IconBolt size={14} />
                  <span>{revealed ? `boost +${total}` : `${boosts.length} boost${plural}`}</span>
                </Flex>
              </Landing>
            </Flex>
          )}
        </Flex>
        {/* one fixed-height slot, so trading the pile counts for the Total
            doesn't move the card */}
        <Flex minH="44px" align="center" justify="center">
          {revealed && value !== null ? (
            <Landing
              key={`total-${turns.reveals}`}
              punch={punching}
              delay={landAt}
              scaleFrom={punch.scaleFrom}
              duration={punch.dur}
              hold={hold !== null}
              reduced={reduced}
            >
              <Flex align="baseline" gap="10px" color="brand.parchment">
                <Text fontSize="12px" fontWeight={600} letterSpacing="0.1em" textTransform="uppercase" opacity={0.7}>
                  Total
                </Text>
                <Text fontFamily={BEBAS} fontSize="44px" lineHeight={1} color="brand.primary" sx={{ fontVariantNumeric: "tabular-nums" }}>
                  <TotalCount
                    printed={value}
                    sum={value + total}
                    countUp={punching && !reduced && boosts.length > 0 && hold === null}
                    delay={landAt}
                  />
                </Text>
                <Text fontSize="12px" opacity={0.7}>
                  {boosts.length
                    ? `${value} + ${boosts.map((b) => b.boost).join(" + ")} boost`
                    : "no boost"}
                </Text>
              </Flex>
            </Landing>
          ) : (
            <Flex
              align="center"
              gap="6px"
              px="14px"
              py="6px"
              borderRadius="999px"
              bg="rgba(44, 24, 49, 0.6)"
              border="1px solid rgba(250, 235, 215, 0.2)"
              color="brand.parchment"
              fontSize="12px"
              fontWeight={600}
            >
              Hand {pool.hand.length} · Deck {pool.deck?.length ?? 0} · Discard {pool.discard.length}
            </Flex>
          )}
        </Flex>
      </Flex>
      <Flex direction="column" gap="10px" px="12px" pt="10px" pb={SAFE_BOTTOM} flexShrink={0}>
        {revealed ? (
          <GoldButton onClick={then(actions.discardInPlay)}>
            <IconTrash />
            <span>{boosts.length > 1 ? "Discard all" : boosts.length ? "Discard both" : "Discard"}</span>
          </GoldButton>
        ) : (
          <GoldButton onClick={actions.toggleReveal}>
            <IconEye />
            <span>Reveal</span>
          </GoldButton>
        )}
        <Flex gap="8px">
          {revealed && (
            <DarkButton flex="1" minH="48px" onClick={actions.toggleReveal}>
              <IconEyeOff size={18} />
              <span>Hide</span>
            </DarkButton>
          )}
          <DarkButton flex="1" minH="48px" onClick={then(actions.returnInPlay)}>
            <IconUndo />
            <span>Return to hand</span>
          </DarkButton>
        </Flex>
        {/* a boost needs a card or ability that grants one — present, but quiet */}
        <Flex gap="8px">
          <GhostButton {...quiet} disabled={!canBoost} onClick={() => setPicking(true)}>
            <IconBolt size={16} />
            <span>Boost from hand</span>
          </GhostButton>
          {boosts.length > 0 && (
            <GhostButton {...quiet} onClick={actions.cancelBoost}>
              <IconUndo size={16} />
              <span>Cancel boost</span>
            </GhostButton>
          )}
          <GhostButton {...quiet} onClick={then(actions.removeInPlay)}>
            <IconBan size={16} />
            <span>Remove from game</span>
          </GhostButton>
        </Flex>
      </Flex>
      {picking && (
        <IrlHandGrid
          zIndex={1070}
          pick={{
            onPick: (index) => {
              actions.boostFromHand(index);
              setPicking(false);
            },
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </IrlSheet>
  );
};
