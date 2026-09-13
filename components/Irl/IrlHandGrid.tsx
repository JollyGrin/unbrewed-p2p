import { Box, Flex, Grid, chakra } from "@chakra-ui/react";
import { AnimatePresence } from "framer-motion";
import { useState } from "react";
import { useProLayout } from "@/lib/pro/useProLayout";
import { irlAnchor } from "@/lib/irl/irlAnchors";
import { IRL_MOTION, useIrlReducedMotion } from "@/lib/irl/irlMotion";
import { boostChoices } from "@/lib/irl/irlPool";
import { useIrlActions, useIrlGame } from "./irlGame";
import {
  CardFace,
  CloseButton,
  EmptyNote,
  IconEye,
  IconShuffle,
  IrlSheet,
  MotionDiv,
  PillButton,
  SAFE_BOTTOM,
  TopBar,
} from "./irl.ui";

/**
 * Hand → "All" (issue #798 §2): every card in hand, 2-up on a phone, 4-up on
 * desktop. "Show to opponent" drops the controls so the phone can be handed
 * across the table — the hand IS what they look at.
 *
 * With `pick` it is the boost picker (rules §5.4 — a boost comes from hand):
 * cards without a positive BOOST value are dimmed and can't be chosen.
 *
 * Each card is a flight anchor, `hand-grid-card-<index>` (#811).
 */
export const IrlHandGrid = ({
  onOpenCard,
  onClose,
  pick,
  zIndex,
}: {
  onOpenCard?: (index: number) => void;
  onClose: () => void;
  pick?: { onPick: (index: number) => void };
  zIndex?: number;
}) => {
  const { pool } = useIrlGame();
  const actions = useIrlActions();
  const { mobile } = useProLayout();
  const [showing, setShowing] = useState(false);
  const hand = pool?.hand ?? [];
  const pickable = new Set(boostChoices(pool));

  const sub = pick
    ? "Choose a card to boost with"
    : showing
      ? `${hand.length} cards`
      : `${hand.length} ${hand.length === 1 ? "card" : "cards"} · tap a card to play it`;

  return (
    <IrlSheet
      label={pick ? "Choose a boost" : "Hand"}
      maxW={mobile ? undefined : "960px"}
      zIndex={zIndex}
    >
      <TopBar
        title={pick ? "Boost" : showing ? "Your hand" : "Hand"}
        sub={sub}
        onBack={onClose}
        right={<CloseButton onClick={onClose} />}
      />
      <Box position="relative" flex="1" minH={0} display="flex" overflow="hidden">
      <Box flex="1" minH={0} overflowY="auto" px="12px" pt="8px" pb="24px">
        {hand.length === 0 ? (
          <EmptyNote>Your hand is empty — draw from the deck.</EmptyNote>
        ) : (
          <Grid
            templateColumns={`repeat(${mobile ? 2 : 4}, minmax(0, 1fr))`}
            gap="12px"
            justifyItems="center"
            alignContent="start"
          >
            {hand.map((card, index) => {
              const offered = !pick || pickable.has(index);
              return (
                <chakra.button
                  type="button"
                  key={`${card.title}-${index}`}
                  w="100%"
                  maxW={mobile ? "172px" : "210px"}
                  lineHeight={0}
                  cursor={showing || !offered ? "default" : "pointer"}
                  opacity={offered ? 1 : 0.35}
                  filter={offered ? undefined : "grayscale(0.6)"}
                  aria-label={
                    pick
                      ? offered
                        ? `${card.title} — boost with +${card.boost}`
                        : `${card.title} — no boost value`
                      : `${card.title} — view`
                  }
                  disabled={showing || !offered}
                  _disabled={{ cursor: "default" }}
                  onClick={() => (pick ? pick.onPick(index) : onOpenCard?.(index))}
                  sx={{ WebkitTapHighlightColor: "transparent" }}
                  {...irlAnchor(`hand-grid-card-${index}`)}
                >
                  <CardFace card={card} width="100%" />
                </chakra.button>
              );
            })}
          </Grid>
        )}
      </Box>
      <AnimatePresence>{showing && <ShowingVignette key="vignette" />}</AnimatePresence>
      </Box>
      <Flex
        gap="8px"
        px="12px"
        pt="8px"
        pb={SAFE_BOTTOM}
        flexShrink={0}
        bg="linear-gradient(180deg, rgba(44, 24, 49, 0), rgba(44, 24, 49, 0.9))"
      >
        {pick ? (
          <PillButton flex="1" onClick={onClose}>
            Cancel — no boost
          </PillButton>
        ) : showing ? (
          <PillButton flex="1" onClick={() => setShowing(false)}>
            Done showing
          </PillButton>
        ) : (
          <>
            <PillButton flex="1" disabled={hand.length === 0} onClick={actions.discardRandom}>
              <IconShuffle />
              <span>Discard random</span>
            </PillButton>
            <PillButton flex="1" disabled={hand.length === 0} onClick={() => setShowing(true)}>
              <IconEye />
              <span>Show to opponent</span>
            </PillButton>
          </>
        )}
      </Flex>
    </IrlSheet>
  );
};

/**
 * "Show to opponent" (#811): a soft vignette settles over the hand while the
 * phone is across the table, and lifts on "Done showing". Reduced motion:
 * it only fades.
 */
const ShowingVignette = () => {
  const reduce = useIrlReducedMotion();
  const { vignette, ease } = IRL_MOTION;
  const fade = { duration: vignette.dur, ease: ease.out };
  return (
    <MotionDiv
      data-testid="irl-show-vignette"
      aria-hidden
      position="absolute"
      inset={0}
      pointerEvents="none"
      bg="radial-gradient(ellipse at 50% 42%, rgba(20, 8, 24, 0) 48%, rgba(20, 8, 24, 0.62) 100%)"
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: vignette.scaleFrom }}
      animate={{ opacity: 1, scale: 1, transition: fade }}
      exit={{ opacity: 0, transition: fade }}
    />
  );
};
