import {
  WebsocketMessage,
  pingMessage,
  pongMessage,
  PlayerState,
  GameState,
} from "./message";

export interface WebsocketProps {
  // Game lobby id
  gid: string;
  // Name of the player
  name: string;
  connectURL: URL;
  // Callbacks
  onGameState: (state: GameState) => void;
}

export interface WebsocketReturn {
  updateMyPlayerState: (state: PlayerState) => void;
}

const js = (e: any) => JSON.stringify(e);
const jp = (e: string) => JSON.parse(e);

export const initializeWebsocket = ({
  name,
  gid,
  connectURL,
  onGameState,
}: WebsocketProps): WebsocketReturn => {
  const url = new URL(`/ws/${gid}`, connectURL);

  url.searchParams.append("name", name);
  url.protocol = url.protocol === "http:" ? "ws:" : "wss:";

  const ws = new WebSocket(url);
  ws.onopen = (event: any): void => {
    ws.send(js(pingMessage));
  };
  ws.onmessage = (event: any): void => {
    const data: WebsocketMessage = jp(event.data);
    switch (data.msgtype) {
      case "ping":
        ws.send(js(pongMessage));
        return;
      case "pong":
        return;
      case "gamestate":
        onGameState(event.data as GameState);
        return;
    }
    console.log("msg", data);
  };
  ws.onerror = (event: any): void => {
    console.log("error", js(event.data));
  };
  ws.onclose = (event: any): void => {
    console.log("close", js(event.data));
  };

  return {
    updateMyPlayerState: (state: PlayerState): void => {
      ws.send(
        js({
          msgtype: "playerstate",
          content: state,
        } as WebsocketMessage)
      );
    },
  };
};
