import { useState } from "react";
import { Button, Input, Stack, Text } from "@chakra-ui/react";
import { joinVoice, type VoiceTicket } from "@/lib/voice/joinVoice";
import type { VoiceRole } from "@/lib/voice/voiceRequest";
import { loadVoiceName, loadVoicePassword, saveVoiceName, saveVoicePassword } from "@/lib/voice/voiceStorage";

type Props = { voiceUrl: string; roomId: string; role: VoiceRole; onJoined: (ticket: VoiceTicket) => void };

const INPUT_STYLE = {
  bg: "brand.surface",
  borderColor: "rgba(231,204,152,0.35)",
  color: "brand.highlight",
  _placeholder: { color: "rgba(241,224,193,0.5)" },
  size: "sm",
} as const;

export function VoiceJoinForm({ voiceUrl, roomId, role, onJoined }: Props) {
  const [name, setName] = useState(loadVoiceName);
  const [password, setPassword] = useState(loadVoicePassword);
  const [error, setError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  const join = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsJoining(true);
    setError(null);
    const result = await joinVoice(voiceUrl, { room: roomId, password, name: name.trim(), role });
    setIsJoining(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    saveVoiceName(name.trim());
    saveVoicePassword(password);
    onJoined(result.ticket);
  };

  return (
    <form onSubmit={join}>
      <Stack spacing="0.6rem">
        <Text fontFamily="LeagueGothic" fontSize="1.4rem" letterSpacing="0.05em" color="brand.primary">
          VOICE · ROOM {roomId}
        </Text>
        <Input {...INPUT_STYLE} placeholder="Your name" value={name} maxLength={32} onChange={(e) => setName(e.target.value)} />
        <Input
          {...INPUT_STYLE}
          type="password"
          placeholder="Voice password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <Text fontSize="0.85rem" color="brand.danger" role="alert">
            {error}
          </Text>
        )}
        <Button
          type="submit"
          size="sm"
          bg="brand.accent"
          color="brand.surfaceDim"
          _hover={{ bg: "brand.accentDeep" }}
          isLoading={isJoining}
          isDisabled={!name.trim() || !password}
        >
          Join voice
        </Button>
      </Stack>
    </form>
  );
}
