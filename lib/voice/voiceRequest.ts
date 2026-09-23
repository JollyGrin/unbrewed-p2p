/**
 * Voice chat — shared request shape for the voice worker's
 * POST /join. Validation itself lives in voice-worker/src/validation.ts (a
 * separate package); this file only keeps the types the client needs.
 */
export type VoiceRole = "player" | "spectator";

export type VoiceJoinRequest = {
  room: string;
  name: string;
  password: string;
  role: VoiceRole;
};
