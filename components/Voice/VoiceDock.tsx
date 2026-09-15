/**
 * Voice chat — floating pill + panel for one voice room.
 * Keyed by room id in VoiceMount, so switching games resets the connection.
 * Backed by the standalone voice-worker/ Cloudflare Worker (Realtime SFU +
 * presence), not by this app's Next server.
 */
import { useState } from "react";
import { Box, Text } from "@chakra-ui/react";
import type { VoiceTicket } from "@/lib/voice/joinVoice";
import { readVoiceUrl } from "@/lib/voice/voiceConfig";
import type { VoiceRole } from "@/lib/voice/voiceRequest";
import { VoiceJoinForm } from "./VoiceJoinForm";
import { VoiceLivePanel, VoiceLivePill } from "./VoiceLive";
import { VoiceIdlePill } from "./VoicePill";
import { useVoiceConnection } from "./useVoiceConnection";

type Props = { roomId: string; role: VoiceRole };

const DOCK_Z_INDEX = 1500;

const panelStyle = {
  mt: "0.5rem",
  w: "min(20rem, calc(100vw - 2rem))",
  bg: "brand.surfaceDim",
  color: "brand.highlight",
  border: "1px solid",
  borderColor: "brand.accent",
  borderRadius: "0.75rem",
  boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
  p: "0.9rem",
} as const;

function VoiceConnectedSession({
  roomId,
  voiceUrl,
  ticket,
  isOpen,
  onToggleOpen,
  onLeave,
}: {
  roomId: string;
  voiceUrl: string;
  ticket: VoiceTicket;
  isOpen: boolean;
  onToggleOpen: () => void;
  onLeave: () => void;
}) {
  const connection = useVoiceConnection(
    { voiceUrl, roomId, ticket: ticket.ticket, myPid: ticket.participantId },
    onLeave,
  );

  return (
    <>
      <VoiceLivePill connection={connection} onClick={onToggleOpen} />
      {isOpen && (
        <Box {...panelStyle}>
          <VoiceLivePanel roomId={roomId} connection={connection} onLeave={onLeave} />
        </Box>
      )}
    </>
  );
}

export default function VoiceDock({ roomId, role }: Props) {
  const voiceUrl = readVoiceUrl();
  const [ticket, setTicket] = useState<VoiceTicket | null>(null);
  // Spectators opened /voice only to talk, so their panel starts open.
  const [isOpen, setIsOpen] = useState(role === "spectator");

  const toggleOpen = () => setIsOpen((open) => !open);
  const leave = () => {
    setTicket(null);
    setIsOpen(false);
  };

  return (
    <Box
      position="fixed"
      // Phones: below the HP chips and turn strip at the left edge — centred at the top it
      // covered a long opponent nameplate. Desktop keeps the top-centre slot.
      top={{ base: "calc(6.2rem + env(safe-area-inset-top, 0px))", md: "0.6rem" }}
      left={{ base: "0.6rem", md: "50%" }}
      transform={{ base: "none", md: "translateX(-50%)" }}
      zIndex={DOCK_Z_INDEX}
      display="flex"
      flexDirection="column"
      alignItems={{ base: "flex-start", md: "center" }}
    >
      {!voiceUrl ? (
        <>
          <VoiceIdlePill onClick={toggleOpen} />
          {isOpen && (
            <Box {...panelStyle}>
              <Text>Voice chat isn&apos;t set up yet.</Text>
            </Box>
          )}
        </>
      ) : !ticket ? (
        <>
          <VoiceIdlePill onClick={toggleOpen} />
          {isOpen && (
            <Box {...panelStyle}>
              <VoiceJoinForm voiceUrl={voiceUrl} roomId={roomId} role={role} onJoined={setTicket} />
            </Box>
          )}
        </>
      ) : (
        <VoiceConnectedSession
          roomId={roomId}
          voiceUrl={voiceUrl}
          ticket={ticket}
          isOpen={isOpen}
          onToggleOpen={toggleOpen}
          onLeave={leave}
        />
      )}
    </Box>
  );
}
