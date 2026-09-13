import { Box, Flex, Text } from "@chakra-ui/react";
import { ReactNode, useEffect, useState } from "react";
import { DeckImportType } from "@/components/DeckPool/deck-import.type";
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
import { irlCharacterCount, irlCounters } from "@/lib/irl/irlCharacters";
import { IrlCardView, CardViewMode } from "./IrlCardView";
import { IrlCharacters } from "./IrlCharacters";
import { IrlDiscard } from "./IrlDiscard";
import { IrlHandGrid } from "./IrlHandGrid";
import { IrlPalette } from "./IrlPalette";
import { CounterChip, DeckTile, HandBar, PileTile } from "./IrlTrayParts";
import { IrlGameProvider, useIrlActions, useIrlGame } from "./irlGame";
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
export const IrlShell = ({ deck }: { deck: DeckImportType }) => (
  <IrlGameProvider initialDeck={deck}>
    <GameMenusProvider>
      <IrlTray />
    </GameMenusProvider>
  </IrlGameProvider>
);

type Sheet = "grid" | "characters" | "discard" | "palette" | null;
type Menu = "deck" | "hand" | "game" | null;

const IrlTray = () => {
  const { deck, pool } = useIrlGame();
  const actions = useIrlActions();
  const game = useWebGame();
  const menus = useGameMenus();

  const [handIndex, setHandIndex] = useState(0);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [cardView, setCardView] = useState<CardViewMode | null>(null);
  const [menu, setMenu] = useState<Menu>(null);
  const [scryOpen, setScryOpen] = useState(false);
  const [deckModal, setDeckModal] = useState<ModalType>(false);
  const [activity, setActivity] = useState(false);
  const [cardArea, areaSize] = useElementSize<HTMLDivElement>();

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

  const swipe = useSwipe({
    onSwipeLeft: () => setHandIndex((i) => Math.min(hand.length - 1, i + 1)),
    onSwipeRight: () => setHandIndex((i) => Math.max(0, i - 1)),
    onTap: () => card && setCardView({ kind: "hand", index }),
    onLongPress: () => card && setMenu("hand"),
  });

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
  };
  const play = () => {
    if (inPlay) {
      setCardView({ kind: "play" });
      return;
    }
    if (!card) return;
    actions.play(index);
    setCardView({ kind: "play" });
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
          <PileTile label="Hand" count={hand.length} action="View" onClick={() => setSheet("grid")} />
          <PileTile
            label="Discard"
            count={pool.discard.length}
            sub={removedCount ? `${removedCount} removed` : undefined}
            action="View"
            onClick={() => setSheet("discard")}
          />
          <DeckTile count={deckCount} onDraw={draw} onMenu={() => setMenu("deck")} />
        </Flex>

        <HandBar count={hand.length} index={index} />

        <Flex ref={cardArea} flex="1" minH={0} align="center" justify="center" gap="12px" px="12px" pt="8px">
          {card ? (
            <>
              {/* peek of the previous card — tap to go back */}
              <Box
                as="button"
                aria-label="Previous card"
                w="22px"
                h={`${cardH * 0.9}px`}
                borderRadius="6px"
                bg="rgba(0, 0, 0, 0.25)"
                overflow="hidden"
                flexShrink={0}
                visibility={index > 0 ? "visible" : "hidden"}
                onClick={() => setHandIndex(Math.max(0, index - 1))}
              >
                {index > 0 && (
                  <Box opacity={0.35} ml={`${-cardW / 2}px`} pointerEvents="none">
                    <CardFace card={hand[index - 1]} width={cardW} />
                  </Box>
                )}
              </Box>
              <Box
                {...swipe}
                role="button"
                tabIndex={0}
                aria-label={`${card.title} — tap to view, hold for more`}
                cursor="pointer"
                userSelect="none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setCardView({ kind: "hand", index });
                }}
                sx={{ touchAction: "pan-y", WebkitTouchCallout: "none" }}
              >
                <CardFace card={card} width={cardW} />
              </Box>
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

      {sheet === "grid" && (
        <IrlHandGrid
          onOpenCard={(i) => setCardView({ kind: "hand", index: i })}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "characters" && <IrlCharacters onClose={() => setSheet(null)} />}
      {sheet === "discard" && <IrlDiscard onClose={() => setSheet(null)} />}
      {sheet === "palette" && (
        <IrlPalette
          onClose={() => setSheet(null)}
          onOpenDeck={() => deckWarning.requestModal("deck")}
          onOpenDiscard={() => setSheet("discard")}
          onOpenScry={() => setScryOpen(true)}
        />
      )}
      {cardView && (
        <IrlCardView
          mode={cardView}
          onMode={setCardView}
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
