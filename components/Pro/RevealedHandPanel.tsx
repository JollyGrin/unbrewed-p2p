/**
 * "Revealed: <hero>'s hand" — the last Keen Hearing reveal, kept readable after
 * the reveal moment has passed. Renders the SNAPSHOT from `lib/pro/revealedHand`
 * (the cards the reveal event carried, labelled with its turn), never live hand
 * state. Collapsible so it can sit out of the way while planning.
 */
import { Box, Flex, Text } from "@chakra-ui/react";
import { ChevronDownIcon, ChevronRightIcon } from "@chakra-ui/icons";
import { useState } from "react";
import { colors, fonts } from "@/styles/style";
import { ResolveCard } from "@/lib/pro/useProCardArt";
import { RevealedHand } from "@/lib/pro/revealedHand";
import { CardFace } from "./ProHand";
import { proVh, proVw } from "@/lib/pro/contained";

export const RevealedHandPanel = ({
  revealed,
  heroName,
  resolveCard,
  labelFor,
  top,
  title,
  note,
  compact = false,
  panelRef,
}: {
  revealed: RevealedHand;
  heroName: string;
  resolveCard: ResolveCard;
  labelFor: (card: string) => string;
  /** Viewport y (px) to start at — the page passes the measured bottom of the
   *  desktop HUD (+ a gap), which grows a row per sidekick. Omitted: the fixed
   *  offsets below (phone, or before the HUD has been measured). */
  top?: number;
  /** Heading override. An open hand (a puzzle shows the opponent's hand face
   *  up, #1678) is live state, not a reveal: it says so instead of "Revealed". */
  title?: string;
  /** Right-hand note override; `null` drops the "as of turn N" stamp. */
  note?: string | null;
  /**
   * One low row — heading on the left, small cards beside it — for a phone-sized
   * puzzle panel (#1679), where the board is fitted BELOW this box and every
   * row of height is board lost.
   */
  compact?: boolean;
  /** The panel's element, for a caller that fits the board around it. */
  panelRef?: (el: HTMLDivElement | null) => void;
}) => {
  const [open, setOpen] = useState(true);
  return (
    <Box
      ref={panelRef}
      data-testid="revealed-hand-panel"
      {...(compact ? { display: "flex", alignItems: "center", gap: "0.5rem" } : {})}
      position="fixed"
      top={top !== undefined ? `${top}px` : { base: "5.75rem", md: "9.5rem" }}
      left="0.75rem"
      zIndex={20}
      maxW={`min(22rem, calc(${proVw(100)} - 1.5rem))`}
      // Below a measured HUD, stop short of the bottom-left activity log and the
      // hand: a big revealed hand scrolls inside the panel instead of running over them.
      {...(top !== undefined ? { maxH: `max(6rem, calc(${proVh(100, "dvh")} - ${top}px - 17rem))`, overflowY: "auto" as const } : {})}
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
        w={compact ? "auto" : "100%"}
        flexShrink={0}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        textAlign="left"
      >
        {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
        <Box {...(compact ? {} : { display: "contents" })}>
          <Text fontFamily={fonts.SpaceGrotesk} fontSize="0.75rem" fontWeight={700}>
            {title ?? <>Revealed: {heroName}&apos;s hand</>}
          </Text>
          {note !== null && (
            <Text fontFamily={fonts.SpaceGrotesk} fontSize="0.65rem" opacity={0.7} ml={compact ? undefined : "auto"}>
              {note ?? <>as of turn {revealed.turn}</>}
            </Text>
          )}
        </Box>
      </Flex>
      {open && (
        <Flex gap="0.35rem" wrap={compact ? "nowrap" : "wrap"} mt={compact ? 0 : "0.4rem"} {...(compact ? { overflowX: "auto" as const, minW: 0 } : {})}>
          {revealed.cards.map((c, i) => (
            <Box key={`${c}-${i}`} w={compact ? "3rem" : "4.5rem"} flexShrink={0} sx={{ aspectRatio: "63 / 88" }}>
              <CardFace card={resolveCard(c)} fallback={labelFor(c)} />
            </Box>
          ))}
        </Flex>
      )}
    </Box>
  );
};
