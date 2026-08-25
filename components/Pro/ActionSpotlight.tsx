/**
 * Action spotlight — the readable half of Slow mode (issue #703).
 *
 * The player report: "when an AI opponent does anything, their action flashes by
 * in an instant… I'd like the card and details to pop up and let me click OK when
 * I've finished reading it." So: one panel per opponent action, holding the game
 * until it's dismissed.
 *
 * It invents no vocabulary. The description is the SAME lines the activity feed
 * rendered for that batch (`diffViews` + `enrichLines`, computed once in the game
 * page and handed here), and the card face is the same `CardFace`/`resolveCard`
 * pair the hand and the log's hover preview use. If the two ever disagreed, the
 * log would be the thing players stopped trusting.
 *
 * Combat batches get faces too. They were skipped at first, on the reasoning that
 * CombatPanel and the #517 linger already reveal both cards — but by the time this
 * panel is being read that reveal has flown past, and the attack/defense/boost
 * cards are exactly what an unfamiliar player wants to study. So every batch shows
 * every public card it touched: the first large, the rest as thumbnails.
 */
import { Box, Button, Flex, Text } from "@chakra-ui/react";
import { useReducedMotion } from "framer-motion";
import { useEffect } from "react";
import { colors, fonts } from "@/styles/style";
import { ProLogLine, ProLogPhase } from "@/lib/pro/gameLog";
import { CardInstanceId, GameEvent } from "@/lib/pro/protocol";
import { spotlightCards } from "@/lib/pro/slowModeQueue";
import { ResolveCard } from "@/lib/pro/useProCardArt";
import { CardFace } from "./ProHand";

/** Everything the panel needs about the batch on screen, assembled by the page. */
export interface ActionSpotlightBatch {
  /** the batch's own activity-feed lines, in emission order */
  lines: ProLogLine[];
  /** the batch's engine events — card pick + combat detection only */
  events: GameEvent[];
  /** "Maneuver" / "Scheme" / … — undefined for a batch that spent no action */
  phase?: ProLogPhase;
  /** display name of the acting seat ("Opponent", "P3"), or null if underivable */
  actor: string | null;
}

/**
 * Above Chakra's modal layer (1400), below the card hover preview (2000).
 *
 * Not arbitrary: a modal CAN be on screen while a batch is paced — the mulligan
 * window stays open while the other seat decides, and the batch that closes it
 * is an opponent batch. At the page's usual overlay z-indexes (~200) the panel
 * rendered UNDERNEATH that dialog, holding the game behind an OK the player
 * could not reach. Sitting on top is safe because a held batch is the only thing
 * the player can act on: everything that needs their input flushes the queue and
 * never reaches this panel.
 *
 * The HUD's chip cluster is lifted just ABOVE both layers while a batch is held
 * (see `ProHud`'s `slowModeHolding`), so the toggle that turns all of this off
 * never ends up behind the backdrop it created.
 */
export const SPOTLIGHT_Z = 1490;

const LINE_COLOR: Record<ProLogLine["who"], string> = {
  you: colors.brand.secondary,
  opp: "#8a4b5e",
  game: colors.brand.surfaceDim,
};

export interface ActionSpotlightProps {
  batch: ActionSpotlightBatch | null;
  /** further opponent batches queued behind this one */
  pending: number;
  resolveCard: ResolveCard;
  labelFor: (instance: CardInstanceId) => string;
  onAdvance: () => void;
  onSkipAll: () => void;
}

export const ActionSpotlight = ({
  batch,
  pending,
  resolveCard,
  labelFor,
  onAdvance,
  onSkipAll,
}: ActionSpotlightProps) => {
  const reducedMotion = !!useReducedMotion();

  // Esc / Enter advance, so the panel is dismissible without reaching for the
  // mouse. Bound on the document rather than by focusing the button: nothing
  // steals focus from whatever the player had.
  //
  // Space is deliberately NOT one of them. The dock's sole-action shortcut and the
  // 1–9 row hotkeys are window listeners of their own (see pages/pro/game.tsx);
  // `preventDefault` does not isolate sibling listeners, so a spacebar here would
  // both advance the spotlight AND fire an action underneath it. Those two guards
  // stand down on `[aria-modal="true"]`, which this panel sets — so while a batch
  // is held, no game hotkey fires at all.
  useEffect(() => {
    if (!batch) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" && e.key !== "Enter") return;
      const target = e.target as HTMLElement | null;
      // never hijack a key someone is typing into (the bug-report dialog, chat)
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (target?.isContentEditable) return;
      e.preventDefault();
      onAdvance();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [batch, onAdvance]);

  if (!batch) return null;

  // The feed's own `cards` arrays widen the net past what the event union names.
  const cards = spotlightCards(batch.events, batch.lines.flatMap((l) => l.cards ?? []));
  const [lead, ...rest] = cards;
  const title = [batch.actor, batch.phase].filter(Boolean).join(" · ") || "Opponent action";

  return (
    <>
      {/* Click-anywhere-to-advance catcher. Also the reason the board is inert
          while a spotlight is up: during a paced opponent action there is nothing
          for the player to click — every batch that needs their input flushes the
          queue and never reaches this panel. */}
      <Box
        position="fixed"
        inset="0"
        zIndex={SPOTLIGHT_Z}
        bg="rgba(20, 8, 24, 0.28)"
        onClick={onAdvance}
        data-testid="action-spotlight-backdrop"
        aria-hidden
      />
      <Flex
        position="fixed"
        top="4.5rem"
        left="50%"
        transform="translateX(-50%)"
        zIndex={SPOTLIGHT_Z + 1}
        maxW="min(38rem, calc(100vw - 2rem))"
        gap="0.85rem"
        p="0.85rem"
        alignItems="stretch"
        bg={colors.brand.parchment}
        color={colors.brand.surfaceDim}
        border="1px solid rgba(72, 40, 79, 0.25)"
        borderRadius="0.75rem"
        boxShadow="0 10px 30px rgba(20, 8, 24, 0.45)"
        // Essential information — never animated away. The entrance is a courtesy
        // and is dropped entirely under prefers-reduced-motion.
        sx={
          reducedMotion
            ? undefined
            : { animation: "unbrewedSpotlightIn 160ms ease-out", "@keyframes unbrewedSpotlightIn": { from: { opacity: 0, transform: "translateX(-50%) translateY(-0.4rem)" }, to: { opacity: 1, transform: "translateX(-50%) translateY(0)" } } }
        }
        role="dialog"
        aria-modal="true"
        aria-label="Opponent action"
        data-testid="action-spotlight"
      >
        {lead && (
          <Box w="8.5rem" flexShrink={0} sx={{ aspectRatio: "63 / 88" }}>
            <CardFace card={resolveCard(lead)} fallback={labelFor(lead)} />
          </Box>
        )}
        <Flex direction="column" justifyContent="space-between" gap="0.6rem" minW="0" flex="1">
          <Box>
            <Text
              fontFamily={fonts.BebasNeueRegular}
              fontSize="0.85rem"
              letterSpacing="0.08em"
              textTransform="uppercase"
              color={colors.brand.secondary}
              mb="0.35rem"
            >
              {title}
            </Text>
            {batch.lines.length > 0 ? (
              batch.lines.map((l, i) => (
                <Text
                  key={i}
                  fontFamily={fonts.SpaceGrotesk}
                  fontSize="0.82rem"
                  lineHeight="1.35"
                  color={LINE_COLOR[l.who]}
                  fontWeight={l.who === "game" ? 700 : 400}
                >
                  {l.text}
                </Text>
              ))
            ) : (
              // A batch can genuinely produce no feed line (issue #509's
              // empty-deck draw). Say so rather than showing a blank panel with
              // an OK button and no explanation.
              <Text fontFamily={fonts.SpaceGrotesk} fontSize="0.82rem" opacity={0.7}>
                Nothing visible changed.
              </Text>
            )}
            {/* Everything else the batch touched — a defense card, the boosts
                discarded under it, a card fetched from the deck. Small, but the
                same faces, and they scroll rather than widening the panel. */}
            {rest.length > 0 && (
              <Flex gap="0.4rem" mt="0.55rem" overflowX="auto" pb="0.15rem">
                {rest.map((c) => (
                  <Box key={c} w="3.6rem" flexShrink={0} sx={{ aspectRatio: "63 / 88" }}>
                    <CardFace card={resolveCard(c)} fallback={labelFor(c)} />
                  </Box>
                ))}
              </Flex>
            )}
          </Box>
          <Flex alignItems="center" justifyContent="flex-end" gap="0.6rem">
            {pending > 0 && (
              <Text
                as="button"
                type="button"
                fontFamily={fonts.SpaceGrotesk}
                fontSize="0.72rem"
                textDecoration="underline"
                opacity={0.75}
                _hover={{ opacity: 1 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSkipAll();
                }}
              >
                +{pending} more · Skip all
              </Text>
            )}
            <Button
              size="sm"
              bg={colors.brand.secondary}
              color={colors.brand.highlight}
              _hover={{ bg: colors.brand.surfaceDim }}
              fontFamily={fonts.SpaceGrotesk}
              onClick={(e) => {
                e.stopPropagation();
                onAdvance();
              }}
            >
              OK (Esc)
            </Button>
          </Flex>
        </Flex>
      </Flex>
    </>
  );
};
