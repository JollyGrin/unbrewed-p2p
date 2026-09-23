/**
 * Voice chat — builds the roster WebSocket URL for a room.
 */
export function voiceRoomSocketUrl(voiceUrl: string, roomId: string, ticket: string): string {
  const wsBase = voiceUrl.replace(/^http/, "ws");
  return `${wsBase}/rooms/${encodeURIComponent(roomId)}/ws?ticket=${encodeURIComponent(ticket)}`;
}
