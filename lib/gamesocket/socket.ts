import { PositionBlob } from "@/components/Positions/position.type";
import {
  WebsocketMessage,
  pingMessage,
  pongMessage,
  PlayerState,
} from "./message";

export type ConnectionStatus = "connecting" | "open" | "closed";

export interface WebsocketProps {
  // Game lobby id
  gid: string;
  // Name of the player
  name: string;
  connectURL: URL;
  // Callbacks
  onGameState: (state: string) => void;
  onGamePositions: (state: string) => void;
  onStatus?: (status: ConnectionStatus) => void;
}

export interface WebsocketReturn {
  updateMyPlayerState: (state: PlayerState) => void;
  updateMyPlayerPosition: (state: PositionBlob) => void;
  close: () => void;
}

const js = (e: any) => JSON.stringify(e);
const jp = (e: string) => JSON.parse(e);

const MAX_RETRY_DELAY_MS = 10_000;

export const initializeWebsocket = ({
  name,
  gid,
  connectURL,
  onGameState,
  onGamePositions,
  onStatus,
}: WebsocketProps): WebsocketReturn => {
  const url = new URL(`/ws/${gid}`, connectURL);

  url.searchParams.append("name", name);
  url.protocol = url.protocol === "http:" ? "ws:" : "wss:";

  let ws: WebSocket;
  let retries = 0;
  let closedByClient = false;
  let retryTimeout: ReturnType<typeof setTimeout> | undefined;

  const connect = () => {
    onStatus?.("connecting");
    ws = new WebSocket(url);
    ws.onopen = (_: any): void => {
      retries = 0;
      onStatus?.("open");
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
    };
    ws.onerror = (event: any): void => {
      console.error("websocket error", event);
    };
    ws.onclose = (): void => {
      onStatus?.("closed");
      if (closedByClient) return;
      // reconnect with capped exponential backoff
      const delay = Math.min(1000 * 2 ** retries, MAX_RETRY_DELAY_MS);
      retries += 1;
      retryTimeout = setTimeout(connect, delay);
    };
  };
  connect();

  const send = (message: WebsocketMessage): void => {
    if (ws.readyState !== WebSocket.OPEN) {
      console.warn("websocket not open, message dropped", message.msgtype);
      return;
    }
    ws.send(js(message));
  };

  return {
    updateMyPlayerState: (state: PlayerState): void => {
      if (!state) {
        // TODO: Idk why this happens, but some undedfined state is being passed in
        return;
      }
      //@ts-ignore
      send({ msgtype: "playerstate", content: state } as WebsocketMessage);
    },
    updateMyPlayerPosition: (state: PositionBlob): void => {
      if (!state) {
        // TODO: Idk why this happens, but some undedfined state is being passed in
        return;
      }
      //@ts-ignore
      send({ msgtype: "playerposition", content: state } as WebsocketMessage);
    },
    close: (): void => {
      closedByClient = true;
      if (retryTimeout) clearTimeout(retryTimeout);
      ws.close();
    },
  };
};
