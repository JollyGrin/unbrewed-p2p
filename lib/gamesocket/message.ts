export interface WebsocketMessage {
  msgtype: string;
  // The content depends on the msgtype.
  content?: GameState | PlayerState;
  error: string;
}

export interface GameState {
  // gid is the Game ID
  gid: string;
  players: Record<string, PlayerState>;
  // TODO: Parse this
  last_updated: string;
}

export interface PlayerState {}

export const pingMessage = {
  msgtype: "ping",
};
export const pongMessage = {
  msgtype: "pong",
};
