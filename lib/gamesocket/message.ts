import { PoolType } from "@/components/DeckPool/PoolFns";

export interface WebsocketMessage {
  msgtype: string;
  // The content depends on the msgtype.
  content?: GameState;
  error: string;
}

export interface GameState {
  // gid is the Game ID
  gid: string;
  players: Record<string, { pool?: PoolType }>;
  // TODO: Parse this
  last_updated: string;
}

// PlayerState can be w/e json payload the game wants to send.
// The golang backend just passes this to all clients.
export interface PlayerState {
  pool: PoolType
}

export const pingMessage = {
  msgtype: "ping",
};
export const pongMessage = {
  msgtype: "pong",
};
