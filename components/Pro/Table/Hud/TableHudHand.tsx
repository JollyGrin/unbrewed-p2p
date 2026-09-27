/**
 * The tabletop HUD's hand: the whole hand fanned face-up over the bottom edge,
 * the way the reference app holds it, instead of the portrait layout's three
 * stacked cards or the flat board's rail strip.
 *
 * Closed, the fan is ONE tap target — it opens the same drawer the portrait
 * peek opens (ProMobileHand's HandDrawer), where each card carries its play
 * buttons and long-press preview. Playing straight off the fan was left out on
 * purpose: at this size a card's own buttons would be slivers, and a stray tap
 * on a half-hidden card must never play it.
 *
 * Geometry (spread, tilt, how far it rises) lives in lib/pro/tableHud so the
 * fan's lane — between the side buttons and the hexagons — is pinned by tests.
 */
import { Box } from "@chakra-ui/react";
import { CardFace } from "@/components/Pro/ProHand";
import { HandDrawer, ProMobileHandProps } from "@/components/Pro/ProMobileHand";
import { HUD_FAN_CARD_W_REM, HUD_FAN_RISE_PX, handFanLayout } from "@/lib/pro/tableHud";
import { RAIL_WIDTH } from "@/lib/pro/mobileLayout";

/** A hand card's height per unit of width (the printed card is 63 × 88 mm). */
const CARD_ASPECT = 88 / 63;

export interface TableHudHandProps extends ProMobileHandProps {
  /** the decision sheet stands along the right edge: centre the fan in what is left */
  besideSheet?: boolean;
}

export const TableHudHand = ({ besideSheet = false, ...props }: TableHudHandProps) => {
  const { hand, resolveCard, labelFor, isOpen, onOpen } = props;
  if (isOpen) return <HandDrawer {...props} />;
  const fan = handFanLayout(hand.length);
  const cardH = `${HUD_FAN_CARD_W_REM * CARD_ASPECT}rem`;
  const spread = fan.length > 1 ? fan[fan.length - 1].x - fan[0].x : 0;
  return (
    <Box
      as="button"
      type="button"
      data-table-hud-hand=""
      aria-label={`Your hand — ${hand.length} card${hand.length === 1 ? "" : "s"}`}
      onClick={onOpen}
      position="fixed"
      left={besideSheet ? `calc(50% - ${RAIL_WIDTH / 2}px)` : "50%"}
      bottom={0}
      // The fan's own box is the strip it rises into; the cards hang out of it
      // below the screen edge.
      h={`${HUD_FAN_RISE_PX}px`}
      w={`${spread + HUD_FAN_CARD_W_REM}rem`}
      transform="translateX(-50%)"
      zIndex={160}
      pointerEvents={hand.length ? "auto" : "none"}
    >
      {fan.map((card, i) => (
        <Box
          key={hand[i]}
          data-hud-fan-card=""
          position="absolute"
          left="50%"
          top={0}
          w={`${HUD_FAN_CARD_W_REM}rem`}
          h={cardH}
          style={{
            marginLeft: `${card.x - HUD_FAN_CARD_W_REM / 2}rem`,
            marginTop: `${card.drop}px`,
            transform: `rotate(${card.rotate}deg)`,
            transformOrigin: "50% 120%",
          }}
          borderRadius="0.45rem"
          overflow="hidden"
          border="2px solid #3A2140"
          boxShadow="0 -2px 12px rgba(12, 4, 16, 0.55)"
          pointerEvents="none"
        >
          <CardFace card={resolveCard(hand[i])} fallback={labelFor(hand[i])} />
        </Box>
      ))}
    </Box>
  );
};
