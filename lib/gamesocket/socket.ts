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
  onGameState: (state: string) => void;
  onGamePositions: (state: string) => void;
}

export interface WebsocketReturn {
  updateMyPlayerState: (state: PlayerState) => void;
  updateMyPlayerPosition: (state: string[]) => void;
}

const js = (e: any) => JSON.stringify(e);
const jp = (e: string) => JSON.parse(e);

export const initializeWebsocket = ({
  name,
  gid,
  connectURL,
  onGameState,
  onGamePositions,
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
        onGameState(event.data as string);
        return;
      case "playerposition":
        onGamePositions(event.data as string);
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
      if (!state) {
        // TODO: Idk why this happens, but some undedfined state is being passed in
        return;
      }
      if (ws.readyState !== ws.OPEN) {
        throw new Error("Websocket not open");
      }
      console.log("sending", state);
      ws.send(
        //@ts-ignore
        js({
          msgtype: "playerstate",
          content: state,
        } as WebsocketMessage)
      );
    },
    updateMyPlayerPosition: (state: string[]): void => {
      if (!state) {
        // TODO: Idk why this happens, but some undedfined state is being passed in
        return;
      }
      if (ws.readyState !== ws.OPEN) {
        throw new Error("Websocket not open");
      }
      console.log("sending", state);
      ws.send(
        //@ts-ignore
        js({
          msgtype: "playerposition",
          content: state,
        } as WebsocketMessage)
      );
    },
  };
};
