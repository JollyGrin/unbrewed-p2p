/**
 * Voice chat — which voice room belongs to the current page.
 *
 * Players are on /pro/game?room=<id> (the game page writes the room id into the
 * URL); spectators open /voice?room=<id>. Reading the route keeps the voice
 * feature out of the upstream game page entirely.
 */
import type { VoiceRole } from "./voiceRequest";

export type VoiceContext = { roomId: string; role: VoiceRole };

type Query = Record<string, string | string[] | undefined>;

const ROLE_BY_PATH: Record<string, VoiceRole> = {
  "/pro/game": "player",
  "/voice": "spectator",
};

export function voiceContextFromRoute(pathname: string, query: Query): VoiceContext | null {
  const role = ROLE_BY_PATH[pathname];
  if (!role) return null;
  const room = Array.isArray(query.room) ? query.room[0] : query.room;
  if (!room) return null;
  return { roomId: room, role };
}
