import { Box, Flex, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { CardBack } from "@/components/CardFactory/card.back";
import { boostChoices, boostTotal, inPlayBoosts } from "@/lib/irl/irlPool";
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
        <Box {...swipe} sx={{ touchAction: "pan-y" }} cursor="grab">
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

const quiet = { flex: "1 1 0", px: "8px", fontSize: "11px", lineHeight: 1.15 };

const InPlayView = ({ onClose }: { onClose: () => void }) => {
  const { pool } = useIrlGame();
  const actions = useIrlActions();
  const [area, size] = useElementSize<HTMLDivElement>();
  const [picking, setPicking] = useState(false);
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

  const total = boostTotal(pool);
  const canBoost = boostChoices(pool).length > 0;
  const boostW = boosts.length > 2 ? 56 : boosts.length > 1 ? 72 : 96;
  const width = fitCard(
    size,
    24 + (boosts.length ? boostW + 10 : 0),
    80,
    revealed ? 236 : 250,
  );
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
        {!revealed && hint && (
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
        )}
        <Flex align="flex-end" gap="10px">
          <Box {...swipe} sx={{ touchAction: "pan-y" }} cursor="grab" aria-label={revealed ? main.title : "Face-down card"}>
            {revealed ? (
              <CardFace card={main} width={width} />
            ) : (
              <CardBack width={`${width}px`} height={`${height}px`} imageUrl={main.cardBackUrl} />
            )}
          </Box>
          {boosts.length > 0 && (
            <Flex direction="column" align="center" gap="6px">
              {boosts.map((boost, i) => (
                <Box key={`${boost.title}-${i}`} position="relative" aria-label={revealed ? `Boost: ${boost.title}` : "Face-down boost"}>
                  {/* the boost stays hidden while the card it boosts is hidden */}
                  {revealed ? (
                    <CardFace card={boost} width={boostW} />
                  ) : (
                    <CardBack
                      width={`${boostW}px`}
                      height={`${boostW * CARD_ASPECT}px`}
                      imageUrl={boost.cardBackUrl}
                    />
                  )}
                  {revealed && (
                    <Box position="absolute" inset={0} borderRadius="4px" bg="rgba(44, 24, 49, 0.35)" />
                  )}
                </Box>
              ))}
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
            </Flex>
          )}
        </Flex>
        {revealed && value !== null ? (
          <Flex align="baseline" gap="10px" color="brand.parchment">
            <Text fontSize="12px" fontWeight={600} letterSpacing="0.1em" textTransform="uppercase" opacity={0.7}>
              Total
            </Text>
            <Text fontFamily={BEBAS} fontSize="44px" lineHeight={1} color="brand.primary" sx={{ fontVariantNumeric: "tabular-nums" }}>
              {value + total}
            </Text>
            <Text fontSize="12px" opacity={0.7}>
              {boosts.length
                ? `${value} + ${boosts.map((b) => b.boost).join(" + ")} boost`
                : "no boost"}
            </Text>
          </Flex>
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
