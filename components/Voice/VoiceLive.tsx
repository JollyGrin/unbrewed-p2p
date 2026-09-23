/**
 * Voice chat — UI for a joined voice session.
 */
import { Button, Flex, Stack, Text } from "@chakra-ui/react";
import toast from "react-hot-toast";
import type { VoiceConnection } from "./useVoiceConnection";
import { VoicePill } from "./VoicePill";

const ROLE_LABEL: Record<string, string> = { player: "Player", spectator: "Spectator" };

export function VoiceLivePill({ connection, onClick }: { connection: VoiceConnection; onClick: () => void }) {
  const label = connection.isConnected ? `${connection.participants.length}` : "…";
  return <VoicePill onClick={onClick} label={label} isLive isMuted={connection.isMuted} />;
}

async function inviteSpectators(roomId: string) {
  const url = `${window.location.origin}/voice?room=${encodeURIComponent(roomId)}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: "Join our Unmatched voice chat", url });
      return;
    } catch {
      // Share sheet dismissed or unsupported — fall back to the clipboard.
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Invite link copied");
  } catch {
    toast(url, { duration: 10000 });
  }
}

export function VoiceLivePanel({
  roomId,
  connection,
  onLeave,
}: {
  roomId: string;
  connection: VoiceConnection;
  onLeave: () => void;
}) {
  const leave = () => {
    connection.leave();
    onLeave();
  };

  return (
    <Stack spacing="0.7rem">
      <Text fontFamily="LeagueGothic" fontSize="1.4rem" letterSpacing="0.05em" color="brand.primary">
        VOICE · ROOM {roomId}
      </Text>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- voice chat, no captions to provide */}
      <audio ref={connection.audioRef} autoPlay hidden />
      {connection.needsAudioUnlock && (
        <Button size="sm" onClick={connection.unlockAudio} bg="brand.accent" color="brand.surfaceDim" _hover={{ bg: "brand.accentDeep" }}>
          Tap to enable sound
        </Button>
      )}
      <Stack spacing="0.4rem" maxH="12rem" overflowY="auto">
        {connection.participants.map((participant) => (
          <Flex key={participant.pid} align="center" justify="space-between" gap="0.5rem">
            <Text noOfLines={1}>
              {participant.name}
              {participant.pid === connection.myPid ? " (you)" : ""}
            </Text>
            <Text fontSize="0.75rem" opacity={0.7} flexShrink={0}>
              {participant.muted ? `${ROLE_LABEL[participant.role]} · muted` : ROLE_LABEL[participant.role]}
            </Text>
          </Flex>
        ))}
      </Stack>
      <Button
        size="md"
        onClick={connection.toggleMute}
        bg={connection.isMuted ? "brand.danger" : "brand.accent"}
        color="brand.surfaceDim"
        _hover={{ opacity: 0.9 }}
      >
        {connection.isMuted ? "Unmute" : "Mute"}
      </Button>
      <Flex gap="0.5rem">
        <Button flex={1} size="sm" variant="outline" color="brand.primary" onClick={() => inviteSpectators(roomId)}>
          Invite spectators
        </Button>
        <Button flex={1} size="sm" variant="outline" color="brand.danger" onClick={leave}>
          Leave
        </Button>
      </Flex>
    </Stack>
  );
}
