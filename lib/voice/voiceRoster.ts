/**
 * Voice chat — the roster shape broadcast by the voice worker's
 * VoiceRoom Durable Object (`{ type: "roster", participants }`) and a safe
 * parser for it. Mirrors voice-worker/src/roster.ts; kept separate because
 * the worker is a standalone package.
 */
import type { VoiceRole } from "./voiceRequest";

export type ParticipantTrack = { sessionId: string; trackName: string; location: "remote" };

export type Participant = {
  pid: string;
  name: string;
  role: VoiceRole;
  muted: boolean;
  track: ParticipantTrack | null;
};

const isRole = (value: unknown): value is VoiceRole => value === "player" || value === "spectator";

function isParticipantTrack(value: unknown): value is ParticipantTrack {
  if (!value || typeof value !== "object") return false;
  const raw = value as Record<string, unknown>;
  return typeof raw.sessionId === "string" && typeof raw.trackName === "string" && raw.location === "remote";
}

function isParticipant(value: unknown): value is Participant {
  if (!value || typeof value !== "object") return false;
  const raw = value as Record<string, unknown>;
  return (
    typeof raw.pid === "string" &&
    typeof raw.name === "string" &&
    isRole(raw.role) &&
    typeof raw.muted === "boolean" &&
    (raw.track === null || isParticipantTrack(raw.track))
  );
}

/** Returns null for anything that isn't a well-formed roster broadcast. */
export function parseRosterMessage(data: unknown): Participant[] | null {
  let parsed: unknown = data;
  if (typeof data === "string") {
    try {
      parsed = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object") return null;
  const raw = parsed as Record<string, unknown>;
  if (raw.type !== "roster" || !Array.isArray(raw.participants)) return null;
  return raw.participants.every(isParticipant) ? (raw.participants as Participant[]) : null;
}
