import { Box, Flex, Text } from "@chakra-ui/react";
import {
  AnimatePresence,
  AnimationPlaybackControls,
  MotionValue,
  animate,
  motion,
  useIsomorphicLayoutEffect,
  useMotionValue,
  useTransform,
} from "framer-motion";
import {
  MutableRefObject,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  DeckImportCardType,
  DeckImportType,
} from "@/components/DeckPool/deck-import.type";
import { ActionLog } from "@/components/Game/ActionLog/action-log";
import { ScryModal } from "@/components/Game/CommandMenu/scry.modal";
import {
  GameMenusProvider,
  useGameMenus,
} from "@/components/Game/GameMenus/game-menus";
import { DeckOpenWarningDialog } from "@/components/Game/deck-open-warning.modal";
import { ModalContainer } from "@/components/Game/game.modal-template";
import { useDeckOpenWarning } from "@/components/Game/useDeckOpenWarning";
import { ModalType } from "@/pages/game";
import { useWebGame } from "@/lib/contexts/WebGameProvider";
import { irlAnchor } from "@/lib/irl/irlAnchors";
import { irlCharacterCount, irlCounters } from "@/lib/irl/irlCharacters";
import { IRL_MOTION, useIrlReducedMotion } from "@/lib/irl/irlMotion";
import { colors } from "@/styles/style";
import { IrlCardView, CardViewMode } from "./IrlCardView";
import { IrlCharacters } from "./IrlCharacters";
import { IrlDiscard } from "./IrlDiscard";
import { IrlFlights } from "./IrlFlightLayer";
import { IrlHandGrid } from "./IrlHandGrid";
import { IrlPalette } from "./IrlPalette";
import { CounterChip, DeckTile, HandBar, PileTile } from "./IrlTrayParts";
import { IrlGameProvider, useIrlActions, useIrlGame } from "./irlGame";
import { warmIrlDeck } from "./irlOffline";
import {
  ActionSheet,
  CARD_ASPECT,
  CardFace,
  DarkButton,
  EmptyNote,
  GROTESK,
  GoldButton,
  IRL_BG,
  IconBan,
  IconDots,
  IconEye,
  IconGrid,
  IconHand,
  IconShuffle,
  IconToBottom,
  IconToTop,
  IconTrash,
  SAFE_BOTTOM,
  SheetAction,
  TRAY_MAX_W,
  TopBar,
  useElementSize,
  useSwipe,
} from "./irl.ui";

/**
 * IRL Mode (issue #798): the phone as a deck tray for playtesting a deck at a
 * physical table — hand, deck, discard, health counters, the hero card. No
 * map, no board, no dice, no tokens, no opponent; the table is real.
 *
 * Mounted under the unchanged OfflineGameProvider (pages/irl.tsx). Every pile
 * move is a PoolFns call through {@link useIrlActions}.
 */

// the carousel's motion tuning lives in IRL_MOTION.carousel; its layout here
const { carousel } = IRL_MOTION;
const PEEK_W = 22;
const CARD_GAP = 12;
/** Room inside the carousel's clip box for the card's drop shadow. */
const SHADOW_PAD = 10;

export const IrlShell = ({ deck }: { deck: DeckImportType }) => (
  <IrlGameProvider initialDeck={deck}>
    {/* inside the provider: the flight layer listens to its fx bus */}
    <IrlFlights>
      <GameMenusProvider>
        <IrlTray />
      </GameMenusProvider>
    </IrlFlights>
  </IrlGameProvider>
);

type Sheet = "grid" | "characters" | "discard" | "palette" | null;
type Menu = "deck" | "hand" | "game" | null;

const IrlTray = () => {
  const { deck, pool } = useIrlGame();
  const actions = useIrlActions();
  const game = useWebGame();
  const menus = useGameMenus();
  const reduce = useIrlReducedMotion();
  // after a play, the in-play view waits for the card's flight to land
  const inPlaySoon = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(inPlaySoon.current), []);

  const [handIndex, setHandIndex] = useState(0);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [cardView, setCardView] = useState<CardViewMode | null>(null);
  const [menu, setMenu] = useState<Menu>(null);
  const [scryOpen, setScryOpen] = useState(false);
  const [deckModal, setDeckModal] = useState<ModalType>(false);
  const [activity, setActivity] = useState(false);
  const [cardArea, areaSize] = useElementSize<HTMLDivElement>();
  // the Draw button's card slides into the carousel; `length` is the hand
  // size that draw produces, so the slide waits for the pool to catch up
  const [drawn, setDrawn] = useState({ seq: 0, length: 0 });
  // here, not in the carousel: it remounts when the hand empties
  const seenDraw = useRef(0);

  // The reused look-through modal also carries the /game commit modal's
  // auto-open, which asks for "commit" whenever a card is in play — IRL has
  // its own in-play view, so that request is ignored here.
  const setDeckModalType = (type: ModalType) => {
    if (type !== "commit") setDeckModal(type);
  };
  const deckWarning = useDeckOpenWarning(setDeckModalType);

  const hand = pool?.hand ?? [];
  const index = Math.min(handIndex, Math.max(0, hand.length - 1));
  const card = hand[index];
  const inPlay = !!pool?.commit?.main;
  const overlayOpen = !!(sheet || cardView || menu || scryOpen || deckModal);

  useEffect(() => {
    if (handIndex !== index) setHandIndex(index);
  }, [handIndex, index]);

  useEffect(() => {
    document.title = `${deck.name} — IRL Mode · Unbrewed`;
  }, [deck.name]);

  // Here, not in pages/irl.tsx: "Change deck…" swaps the deck in place, and
  // that deck must work offline too (#801).
  useEffect(() => {
    warmIrlDeck(deck);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSheet((open) => (open === "palette" ? null : "palette"));
        return;
      }
      if (e.key === "Escape") {
        if (menu) setMenu(null);
        else if (cardView) setCardView(null);
        else if (sheet) setSheet(null);
        return;
      }
      // arrows belong to a focused field (the palette's search)
      if ((e.target as HTMLElement | null)?.closest?.("input, textarea")) return;
      if (overlayOpen) return;
      if (e.key === "ArrowLeft") setHandIndex((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setHandIndex((i) => i + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu, cardView, sheet, overlayOpen]);

  if (!pool) return <Box h="100svh" bg={IRL_BG} />;

  const counters = irlCounters(deck, pool);
  const compact = counters.length > 2;
  const deckCount = pool.deck?.length ?? 0;
  const removedCount = pool.removed?.length ?? 0;
  const hero = pool.hero;
  const sidekickNames = [
    counters.find((c) => c.id === "sidekick")?.name,
    ...pool.extraCharacters.map((c) => c.hero.name),
  ].filter(Boolean);

  // Largest card that fits beside the side buttons (56 + gaps) and the peek.
  const cardW = Math.max(
    96,
    Math.min(
      240,
      areaSize.width - 56 - 22 - 24 - 24,
      (areaSize.height - 8) / CARD_ASPECT,
    ),
  );
  const cardH = cardW * CARD_ASPECT;

  const draw = () => {
    const before = hand.length;
    actions.draw();
    setHandIndex(before); // show the card just drawn
    if (deckCount) setDrawn(({ seq }) => ({ seq: seq + 1, length: before + 1 }));
  };
  /**
   * Open the in-play view. Right after a play it slides in as the played
   * card's flight (#811) lands, so the card is seen going face-down first;
   * whatever else the player opens meanwhile wins.
   */
  const openInPlay = (afterPlay: boolean) => {
    clearTimeout(inPlaySoon.current);
    if (!afterPlay || reduce) {
      setCardView({ kind: "play" });
      return;
    }
    setCardView(null);
    const { flight, sheet } = IRL_MOTION;
    inPlaySoon.current = setTimeout(
      () => setCardView((open) => open ?? { kind: "play" }),
      Math.max(0, flight.dur - sheet.dur) * 1000,
    );
  };
  const play = () => {
    if (inPlay) {
      openInPlay(false);
      return;
    }
    if (!card) return;
    actions.play(index);
    openInPlay(true);
  };

  const deckActions: SheetAction[] = [
    { id: "draw2", label: "Draw 2", onSelect: () => actions.drawMany(2) },
    { id: "draw3", label: "Draw 3", onSelect: () => actions.drawMany(3) },
    { id: "shuffle", label: "Shuffle deck", icon: <IconShuffle />, onSelect: actions.shuffle },
    { id: "scry", label: "Look at the top cards…", onSelect: () => setScryOpen(true), disabled: !deckCount },
    { id: "mill", label: "Discard the top card", icon: <IconTrash />, onSelect: actions.discardTop },
    {
      id: "search",
      label: "Look through deck (shuffles after)",
      onSelect: () => deckWarning.requestModal("deck"),
      disabled: !deckCount,
    },
  ];
  const handActions: SheetAction[] = card
    ? [
        { id: "view", label: "View card", icon: <IconEye size={18} />, onSelect: () => setCardView({ kind: "hand", index }) },
        { id: "top", label: "Top of deck", icon: <IconToTop />, onSelect: () => actions.toDeckTop(index) },
        { id: "bottom", label: "Bottom of deck", icon: <IconToBottom />, onSelect: () => actions.toDeckBottom(index) },
        { id: "random", label: "Discard a random card", icon: <IconShuffle />, onSelect: actions.discardRandom },
        { id: "remove", label: "Remove from game", icon: <IconBan />, onSelect: () => actions.removeFromHand(index), tone: "danger" },
      ]
    : [];
  const gameActions: SheetAction[] = [
    { id: "palette", label: "All actions…", onSelect: () => setSheet("palette") },
    {
      id: "activity",
      label: activity ? "Hide activity log" : "Show activity log",
      onSelect: () => setActivity((open) => !open),
    },
    ...(menus
      ? [
          { id: "change", label: "Change deck…", onSelect: menus.openChangeDeck },
          { id: "reset", label: "Reset — new game…", onSelect: menus.openNewGame, tone: "danger" as const },
        ]
      : []),
  ];

  return (
    <Box bg={IRL_BG} minH="100svh" color="brand.parchment" fontFamily={GROTESK}>
      <Flex direction="column" h="100svh" maxW={TRAY_MAX_W} mx="auto" overflow="hidden">
        <TopBar
          title={hero.name || deck.name}
          sub={[hero.isRanged ? "Ranged" : "Melee", `move ${hero.move}`, ...sidekickNames].join(" · ")}
          backHref="/bag"
          backLabel="Back to your bag"
          right={
            <DarkButton p={0} w="44px" aria-label="Game menu" onClick={() => setMenu("game")}>
              <IconDots />
            </DarkButton>
          }
        />

        <Box
          display="grid"
          gridTemplateColumns={compact ? "repeat(2, minmax(0, 1fr))" : "1fr"}
          gap="8px"
          px="12px"
          pt="4px"
          flexShrink={0}
          maxH="36svh"
          overflowY="auto"
        >
          {counters.map((counter) => (
            <CounterChip
              key={counter.id}
              counter={counter}
              compact={compact}
              onAdjust={(delta) => actions.adjust(counter, delta)}
            />
          ))}
        </Box>

        <Flex gap="8px" px="12px" pt="12px" flexShrink={0}>
          <PileTile label="Characters" count={irlCharacterCount(deck)} action="View" onClick={() => setSheet("characters")} />
          <PileTile label="Hand" count={hand.length} action="View" anchor="hand-tile" onClick={() => setSheet("grid")} />
          <PileTile
            label="Discard"
            count={pool.discard.length}
            sub={removedCount ? `${removedCount} removed` : undefined}
            action="View"
            anchor="discard-tile"
            onClick={() => setSheet("discard")}
          />
          <DeckTile count={deckCount} onDraw={draw} onMenu={() => setMenu("deck")} />
        </Flex>

        <HandBar count={hand.length} index={index} />

        <Flex ref={cardArea} flex="1" minH={0} align="center" justify="center" gap="12px" px="12px" pt="8px">
          {card ? (
            <>
              <HandCarousel
                hand={hand}
                index={index}
                cardW={cardW}
                cardH={cardH}
                drawn={drawn}
                seenDraw={seenDraw}
                onIndex={setHandIndex}
                onOpen={() => setCardView({ kind: "hand", index })}
                onMenu={() => setMenu("hand")}
              />
              <Flex direction="column" gap="10px" flexShrink={0}>
                <SideButton label="All" onClick={() => setSheet("grid")}>
                  <IconGrid />
                </SideButton>
                <SideButton label="Top of deck" onClick={() => actions.toDeckTop(index)}>
                  <IconToTop />
                </SideButton>
                <SideButton label="Discard" danger onClick={() => actions.discard(index)}>
                  <IconTrash />
                </SideButton>
              </Flex>
            </>
          ) : (
            <Flex direction="column" gap="10px" w="100%" maxW="260px">
              <EmptyNote>Your hand is empty.</EmptyNote>
              <DarkButton onClick={draw}>Draw a card</DarkButton>
            </Flex>
          )}
        </Flex>

        <Flex align="center" gap="8px" px="12px" pt="10px" pb={SAFE_BOTTOM} flexShrink={0}>
          <GoldButton flex="1" disabled={!inPlay && !card} onClick={play}>
            {inPlay ? <IconEye /> : <IconHand />}
            <span>{inPlay ? "1 card in play — open" : "Play this card"}</span>
          </GoldButton>
          <DarkButton p={0} w="48px" h="48px" aria-label="More for this card" disabled={!card} onClick={() => setMenu("hand")}>
            <IconDots />
          </DarkButton>
        </Flex>
      </Flex>

      {/* keeps a closed sheet mounted while it slides back out */}
      <AnimatePresence>
        {sheet === "grid" && (
          <IrlHandGrid
            key="grid"
            onOpenCard={(i) => setCardView({ kind: "hand", index: i })}
            onClose={() => setSheet(null)}
          />
        )}
        {sheet === "characters" && (
          <IrlCharacters key="characters" onClose={() => setSheet(null)} />
        )}
        {sheet === "discard" && (
          <IrlDiscard key="discard" onClose={() => setSheet(null)} />
        )}
        {sheet === "palette" && (
          <IrlPalette
            key="palette"
            onClose={() => setSheet(null)}
            onOpenDeck={() => deckWarning.requestModal("deck")}
            onOpenDiscard={() => setSheet("discard")}
            onOpenScry={() => setScryOpen(true)}
          />
        )}
      </AnimatePresence>
      {cardView && (
        <IrlCardView
          mode={cardView}
          onMode={(next) => (next.kind === "play" ? openInPlay(true) : setCardView(next))}
          onClose={() => setCardView(null)}
        />
      )}

      <ActionSheet title="Deck" isOpen={menu === "deck"} onClose={() => setMenu(null)} actions={deckActions} />
      <ActionSheet
        title={card?.title ?? "Hand"}
        isOpen={menu === "hand"}
        onClose={() => setMenu(null)}
        actions={handActions}
      />
      <ActionSheet title="Game" isOpen={menu === "game"} onClose={() => setMenu(null)} actions={gameActions} />

      <ScryModal
        isOpen={scryOpen}
        onClose={() => setScryOpen(false)}
        deck={pool.deck ?? []}
        onApply={actions.reorderTop}
      />
      {deckModal === "deck" && (
        <ModalContainer
          isOpen
          modalType="deck"
          setModalType={setDeckModalType}
          gameState={game.gameState}
          setPlayerState={game.setPlayerState}
          logAction={game.logAction}
        />
      )}
      <DeckOpenWarningDialog
        isOpen={!!deckWarning.pendingWarning}
        onCancel={deckWarning.cancelOpen}
        onConfirm={deckWarning.confirmOpen}
      />
      {activity && <ActionLog />}
    </Box>
  );
};

type Transit = { card: DeckImportCardType; at: number };

/**
 * The tray's hand card as a carousel. One motion value, `pos`, is the hand
 * index being looked at, as a float: the card follows the finger by moving
 * it, and every way of turning the card (drag, fling, arrow keys, the peek,
 * Draw) springs it to the new index. Each card sits at `(at - pos) * pitch`,
 * so the previous card IS the peek and slides along with the drag.
 *
 * A jump of more than one card (Draw from the front of the hand) shows the
 * card left behind as the neighbour for the slide (`transit`), so the drawn
 * card still arrives from the right instead of scrolling through the hand.
 */
const HandCarousel = ({
  hand,
  index,
  cardW,
  cardH,
  drawn,
  seenDraw,
  onIndex,
  onOpen,
  onMenu,
}: {
  hand: DeckImportCardType[];
  index: number;
  cardW: number;
  cardH: number;
  drawn: { seq: number; length: number };
  seenDraw: MutableRefObject<number>;
  onIndex: (index: number) => void;
  onOpen: () => void;
  onMenu: () => void;
}) => {
  const reduce = useIrlReducedMotion();
  const pos = useMotionValue(index);
  const running = useRef<AnimationPlaybackControls>();
  const dragFrom = useRef<number | null>(null);
  const [transit, setTransit] = useState<Transit | null>(null);
  // the long-press ring is filling
  const [holding, setHolding] = useState(false);
  const last = useRef({ index, length: hand.length, card: hand[index] });
  // centre-to-centre distance that leaves a scaled neighbour's near edge
  // CARD_GAP from the card — the previous one ends exactly at the peek
  const pitch = cardW * ((1 + carousel.sideScale) / 2) + CARD_GAP;
  const card = hand[index];

  const settle = useCallback(
    (to: number, from?: number) => {
      running.current?.stop();
      if (from !== undefined) pos.jump(from);
      if (reduce) {
        pos.jump(to);
        setTransit(null);
        return;
      }
      running.current = animate(pos, to, {
        ...carousel.spring,
        onComplete: () => setTransit(null),
      });
    },
    [pos, reduce],
  );

  // Layout effect: a new index and its slide start in the same frame.
  useIsomorphicLayoutEffect(() => {
    const prev = last.current;
    last.current = { index, length: hand.length, card: hand[index] };

    if (drawn.seq !== seenDraw.current && hand.length >= drawn.length) {
      seenDraw.current = drawn.seq;
      const left = prev.card;
      const outgoing =
        left && left !== hand[index] && left !== hand[index - 1] ? left : null;
      setTransit(outgoing ? { card: outgoing, at: index - 1 } : null);
      settle(index, index - 1);
      return;
    }
    if (index === prev.index) return;
    if (hand.length < prev.length) {
      // a card left the hand and the index clamped: no slide (#811 flies it)
      running.current?.stop();
      setTransit(null);
      pos.jump(index);
      return;
    }
    const step = index - prev.index;
    if (Math.abs(step) === 1) {
      setTransit(null);
      settle(index);
      return;
    }
    const dir = Math.sign(step);
    setTransit(prev.card ? { card: prev.card, at: index - dir } : null);
    settle(index, index - dir);
  }, [index, hand, drawn, seenDraw, settle, pos]);

  const swipe = useSwipe({
    onTap: onOpen,
    onLongPress: onMenu,
    onHold: setHolding,
    // reduced motion: no follow — the old swipe that just changes the card
    ...(reduce
      ? {
          onSwipeLeft: () => onIndex(Math.min(hand.length - 1, index + 1)),
          onSwipeRight: () => onIndex(Math.max(0, index - 1)),
        }
      : {
          onDrag: (dx: number) => {
            if (dragFrom.current === null) {
              // grabbing a card mid-slide catches it where it is
              running.current?.stop();
              dragFrom.current = pos.get();
            }
            const max = hand.length - 1;
            let next = dragFrom.current - dx / pitch;
            if (next < 0) next *= carousel.edgeResist;
            else if (next > max) next = max + (next - max) * carousel.edgeResist;
            pos.set(Math.min(index + 1, Math.max(index - 1, next)));
          },
          onDragEnd: (dx: number, velocityX: number) => {
            dragFrom.current = null;
            const turn =
              Math.abs(velocityX) > carousel.flingPxS
                ? -Math.sign(velocityX)
                : Math.abs(dx) > carousel.swipePx
                ? -Math.sign(dx)
                : 0;
            const target = Math.min(hand.length - 1, Math.max(0, index + turn));
            // a new index springs from the layout effect, drag velocity and all
            if (target !== index) onIndex(target);
            else settle(index);
          },
        }),
  });

  const slots: (Transit & { key: string })[] = [];
  for (let at = index - 2; at <= index + 2; at++) {
    const moving = transit?.at === at ? transit.card : undefined;
    const shown = moving ?? hand[at];
    if (shown) slots.push({ key: moving ? `out:${at}` : `${at}`, card: shown, at });
  }
  const left = PEEK_W + CARD_GAP;

  return (
    <Box
      position="relative"
      flexShrink={0}
      overflow="hidden"
      w={`${left + cardW + SHADOW_PAD}px`}
      h={`${cardH + SHADOW_PAD * 2}px`}
      // the shadow room overlaps the gaps around it instead of pushing the
      // side buttons over — the layout is the pre-carousel one
      my={`${-SHADOW_PAD}px`}
      mr={`${-SHADOW_PAD}px`}
    >
      {slots.map((slot) => (
        <CarouselSlot
          key={slot.key}
          card={slot.card}
          at={slot.at}
          pos={pos}
          pitch={pitch}
          left={left}
          top={SHADOW_PAD}
          width={cardW}
        />
      ))}
      {/* the peek — tap to go back */}
      <Box
        as="button"
        aria-label="Previous card"
        position="absolute"
        left={0}
        top={`${SHADOW_PAD + cardH * 0.05}px`}
        w={`${PEEK_W}px`}
        h={`${cardH * 0.9}px`}
        borderRadius="6px"
        visibility={index > 0 ? "visible" : "hidden"}
        onClick={() => onIndex(Math.max(0, index - 1))}
      />
      {/* the card's hit area stays put while the art moves under it — and
          is the tray card's flight anchor (#811) */}
      <Box
        {...swipe}
        {...irlAnchor("hand-card")}
        role="button"
        tabIndex={0}
        aria-label={`${card.title} — tap to view, hold for more`}
        position="absolute"
        left={`${left}px`}
        top={`${SHADOW_PAD}px`}
        w={`${cardW}px`}
        h={`${cardH}px`}
        cursor="pointer"
        userSelect="none"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onOpen();
        }}
        sx={{ touchAction: "pan-y", WebkitTouchCallout: "none" }}
      >
        {holding && <PressRing width={cardW} height={cardH} />}
      </Box>
    </Box>
  );
};

/** a rounded rect's outline, from the middle of its top edge, clockwise */
const ringPath = (x: number, y: number, w: number, h: number, r: number) =>
  [
    `M${x + w / 2} ${y}`,
    `H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}`,
    `V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}`,
    `H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}`,
    `V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}`,
    "Z",
  ].join("");

/**
 * The long-press ring (#811): a thin line runs round the tray card over the
 * hold, so the player knows a menu is coming. An affordance, not decoration —
 * it fills under reduced motion too.
 */
const PressRing = ({ width, height }: { width: number; height: number }) => {
  const out = 5;
  const stroke = 3;
  const w = width + out * 2;
  const h = height + out * 2;
  const inset = stroke / 2;
  return (
    <svg
      aria-hidden
      data-testid="irl-press-ring"
      width={w}
      height={h}
      style={{ position: "absolute", left: -out, top: -out, pointerEvents: "none" }}
    >
      <motion.path
        d={ringPath(inset, inset, w - stroke, h - stroke, width * 0.05 + out)}
        fill="none"
        stroke={colors.brand.accent}
        strokeWidth={stroke}
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: IRL_MOTION.longPress.dur, ease: "linear" }}
      />
    </svg>
  );
};

const CarouselSlot = ({
  card,
  at,
  pos,
  pitch,
  left,
  top,
  width,
}: {
  card: DeckImportCardType;
  at: number;
  pos: MotionValue<number>;
  pitch: number;
  left: number;
  top: number;
  width: number;
}) => {
  const away = (p: number) => Math.min(1, Math.abs(at - p));
  const x = useTransform(pos, (p) => (at - p) * pitch);
  const scale = useTransform(pos, (p) => 1 - (1 - carousel.sideScale) * away(p));
  const opacity = useTransform(pos, (p) => 1 - (1 - carousel.sideOpacity) * away(p));
  return (
    <motion.div
      aria-hidden
      style={{
        position: "absolute",
        left,
        top,
        x,
        scale,
        opacity,
        pointerEvents: "none",
      }}
    >
      <CardFace card={card} width={width} />
    </motion.div>
  );
};

const SideButton = ({
  label,
  danger,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) => (
  <DarkButton
    flexDirection="column"
    w="56px"
    h="56px"
    p={0}
    gap="2px"
    onClick={onClick}
    {...(danger
      ? { bg: "rgba(255, 99, 71, 0.9)", borderColor: "rgba(255, 99, 71, 0.9)" }
      : {})}
  >
    {children}
    <Text as="span" fontSize="9px" lineHeight={1.1} textAlign="center">
      {label}
    </Text>
  </DarkButton>
);
