/**
 * The winner screen's Rematch control when the rematch is NEGOTIATED (p2p #880):
 * a PvP room on an engine that speaks protocol v35. Pressing Rematch asks the
 * other player(s); they get Accept / Decline; when everyone agrees the server
 * builds the room and both pages move there. Vs AI, and against a v34 engine,
 * ProDock keeps the one-tap `?rematch=` link instead.
 */
import { Button, Flex, Spinner, Text } from "@chakra-ui/react";
import { TbRepeat } from "react-icons/tb";
import { TAP_TARGET } from "@/lib/pro/mobileLayout";
import type { PlayerId } from "@/lib/pro/protocol";
import { RematchOfferState, rematchNoticeText } from "@/lib/pro/rematchOffer";

export interface RematchNegotiation {
  state: RematchOfferState;
  /** seat → the name the table shows for it */
  nameOf: (player: PlayerId) => string;
  /** who an offer waits on: "Opponent", a display name, or "the other players" */
  waitingFor: string;
  onOffer: () => void;
  onCancel: () => void;
  onRespond: (accept: boolean) => void;
}

const GOLD = {
  minH: TAP_TARGET,
  px: "1.4rem",
  bg: "brand.accent",
  color: "brand.surfaceDim",
  fontWeight: 700,
  _hover: { bg: "brand.accentDeep" },
  _active: { bg: "brand.accentDeep" },
} as const;

const QUIET = {
  minH: TAP_TARGET,
  px: "1.1rem",
  variant: "outline",
  borderColor: "rgba(255,255,255,0.35)",
  color: "brand.parchment",
  _hover: { bg: "rgba(255,255,255,0.08)" },
} as const;

/**
 * `compact`: the narrow shells (landscape rail, HUD side sheet), whose dock is
 * a short box under a 3rem VICTORY/DEFEAT — the copy shrinks to one line so
 * Accept / Decline stay on screen without scrolling. Tap targets never shrink.
 */
export function RematchOfferPanel({ negotiation, compact = false }: { negotiation: RematchNegotiation; compact?: boolean }) {
  const { state, nameOf, waitingFor, onOffer, onCancel, onRespond } = negotiation;
  const copy = compact ? "0.78rem" : "0.95rem";
  return (
    <Flex
      direction="column"
      align="center"
      gap={compact ? "0.2rem" : "0.35rem"}
      mt={compact ? "0.1rem" : "0.3rem"}
      mb="0.15rem"
      data-testid="rematch-offer"
    >
      {state.phase === "idle" && (
        <>
          {state.notice && (
            <Text role="status" fontSize={compact ? copy : "0.9rem"} color="brand.parchment" opacity={0.9} textAlign="center">
              {rematchNoticeText(state.notice, nameOf)}
            </Text>
          )}
          <Button {...GOLD} leftIcon={<TbRepeat size="1.1rem" />} onClick={onOffer}>
            Rematch — same setup
          </Button>
        </>
      )}
      {state.phase === "offering" && (
        <>
          <Text role="status" fontSize={copy} color="brand.parchment" textAlign="center">
            <Spinner size="xs" mr="0.4rem" />
            Waiting for {waitingFor} to accept…
          </Text>
          <Button {...QUIET} onClick={onCancel}>
            Cancel
          </Button>
        </>
      )}
      {state.phase === "incoming" && (
        <>
          <Text role="status" fontSize={copy} color="brand.parchment" textAlign="center" fontWeight={600}>
            {nameOf(state.from)} wants a rematch, same setup
          </Text>
          <Flex gap="0.5rem">
            <Button {...GOLD} leftIcon={<TbRepeat size="1.1rem" />} onClick={() => onRespond(true)}>
              Accept
            </Button>
            <Button {...QUIET} onClick={() => onRespond(false)}>
              Decline
            </Button>
          </Flex>
        </>
      )}
      {(state.phase === "accepting" || state.phase === "ready") && (
        <Text role="status" fontSize={copy} color="brand.parchment" textAlign="center">
          <Spinner size="xs" mr="0.4rem" />
          {state.phase === "ready" ? "Starting the rematch…" : "Accepted — starting the rematch…"}
        </Text>
      )}
    </Flex>
  );
}
