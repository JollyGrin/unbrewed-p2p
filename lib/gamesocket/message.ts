import { PoolType } from "@/components/DeckPool/PoolFns";
import { PositionType } from "@/components/Positions/position.type";

export interface WebsocketMessage {
  msgtype: string;
  // The content depends on the msgtype.
  content?: GameState | PositionState;
  error: string;
}

export interface GameState {
  // gid is the Game ID
  gid: string;
  players: Record<string, PlayerState>;
  // TODO: Parse this
  last_updated: string;
}

// PlayerState can be w/e json payload the game wants to send.
// The golang backend just passes this to all clients.
export interface PlayerState {
  pool?: PoolType;
  // Shared map, carried on every player blob so any player can change it and
  // the rest of the room converges on it. mapUpdatedAt is a logical clock
  // (see WebGameProvider): higher value wins, name breaks ties. mapUrl === ""
  // means the map was explicitly cleared.
  mapUrl?: string;
  mapUpdatedAt?: number;
}

export type PositionState = Record<string, PositionType>;

export const pingMessage = {
  msgtype: "ping",
};
export const pongMessage = {
  msgtype: "pong",
};
