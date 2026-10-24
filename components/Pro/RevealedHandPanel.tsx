/**
 * "Revealed: <hero>'s hand" — the last Keen Hearing reveal, kept readable after
 * the reveal moment has passed. Renders the SNAPSHOT from `lib/pro/revealedHand`
 * (the cards the reveal event carried, labelled with its turn), never live hand
 * state. Collapsible so it can sit out of the way while planning.
 *
 * Fixed at the top-left under the HUD by default. A format that reserves its own chrome
 * strip above the board (Adventure's band, `formatOwnsRevealedHand`) renders it `inline`
 * inside that strip instead, so it can never cover a printed board space or the dock.
 */
import { Box, Flex, Text } from "@chakra-ui/react";
import { ChevronDownIcon, ChevronRightIcon } from "@chakra-ui/icons";
import { useState } from "react";
import { colors, fonts } from "@/styles/style";
import { ResolveCard } from "@/lib/pro/useProCardArt";
import { RevealedHand } from "@/lib/pro/revealedHand";
import { CardFace } from "./ProHand";

export const RevealedHandPanel = ({
  revealed,
  heroName,
  resolveCard,
  labelFor,
  top,
  inline = false,
}: {
  revealed: RevealedHand;
  heroName: string;
  resolveCard: ResolveCard;
  labelFor: (card: string) => string;
  /** Viewport y (px) to start at — the page passes the measured bottom of the
   *  desktop HUD (+ a gap), which grows a row per sidekick. Omitted: the fixed
   *  offsets below (phone, or before the HUD has been measured). */
  top?: number;
  /** Flow in the parent's layout (a format's chrome strip) instead of floating fixed;
   *  `top` is ignored. Slightly smaller cards, and it scrolls past the strip's height. */
  inline?: boolean;
}) => {
  const [open, setOpen] = useState(true);
  const placement = inline
    ? {
        position: "relative" as const,
        // Adventure's band strip is 9rem (ADVENTURE_BAND_FIT); never grow past it, and
        // shrink on a narrow window rather than pushing the strip's own panels out.
        flex: "0 1 22rem",
        minW: "9rem",
        maxH: "9rem",
        overflowY: "auto" as const,
      }
    : {
        position: "fixed" as const,
        top: top !== undefined ? `${top}px` : { base: "5.75rem", md: "9.5rem" },
        left: "0.75rem",
        zIndex: 20,
        maxW: "min(22rem, calc(100vw - 1.5rem))",
        // Below a measured HUD, stop short of the bottom-left activity log and the
        // hand: a big revealed hand scrolls inside the panel instead of running over them.
        ...(top !== undefined ? { maxH: `max(6rem, calc(100dvh - ${top}px - 17rem))`, overflowY: "auto" as const } : {}),
      };
  return (
    <Box
      data-testid="revealed-hand-panel"
      data-inline={inline ? "true" : undefined}
      {...placement}
      bg="brand.surfaceDim"
      border={`1px solid ${colors.brand.primary}`}
      borderRadius="0.5rem"
      p="0.4rem 0.55rem"
    >
      <Flex
        as="button"
        type="button"
        align="center"
        gap="0.3rem"
        w="100%"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        textAlign="left"
      >
        {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
        <Text fontFamily={fonts.SpaceGrotesk} fontSize="0.75rem" fontWeight={700}>
          Revealed: {heroName}&apos;s hand
        </Text>
        <Text fontFamily={fonts.SpaceGrotesk} fontSize="0.65rem" opacity={0.7} ml="auto">
          as of turn {revealed.turn}
        </Text>
      </Flex>
      {open && (
        <Flex gap="0.35rem" wrap="wrap" mt="0.4rem">
          {revealed.cards.map((c, i) => (
            <Box key={`${c}-${i}`} w={inline ? "4rem" : "4.5rem"} sx={{ aspectRatio: "63 / 88" }}>
              <CardFace card={resolveCard(c)} fallback={labelFor(c)} />
            </Box>
          ))}
        </Flex>
      )}
    </Box>
  );
};
