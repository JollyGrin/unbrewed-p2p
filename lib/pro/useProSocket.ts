/**
 * Thin WebSocket client for the Pro server. No rules logic — it ships
 * ClientMsg out and hands ServerMsg payloads to React state.
 *
 * Endpoint comes from NEXT_PUBLIC_PRO_WS_URL (unset until the Railway deploy
 * exists — the game page shows a "backend not connected" panel in that case).
 *
 * Reconnect: on ROOM_CREATED/ROOM_JOINED the server issues a token; we keep it
 * in sessionStorage (per-tab, survives refresh, dies with the tab) and replay
 * RECONNECT on the next socket open for the same room.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Action,
  ClientMsg,
  PlayerView,
  PROTOCOL_VERSION,
  ServerMsg,
  ViewPrompt,
} from "./protocol";

export type ProConnectionStatus =
  | "idle" // no URL configured
  | "connecting"
  | "open"
  | "reconnecting"
  | "closed";

export interface ProGameSnapshot {
  view: PlayerView;
  legalActions: Action[];
  prompt: ViewPrompt | null; // convenience alias of view.prompt
}

export interface UseProSocketReturn {
  status: ProConnectionStatus;
  roomId: string | null;
  snapshot: ProGameSnapshot | null;
  opponentConnected: boolean;
  error: { code: string; message: string } | null;
  createRoom: (heroId: string) => void;
  joinRoom: (roomId: string, heroId: string) => void;
  sendAction: (action: Action) => void;
  respondToPrompt: (promptId: string, optionId: string) => void;
}

const tokenKey = (roomId: string) => `unbrewed-pro-token-${roomId}`;

const MAX_RETRY_DELAY_MS = 10_000;

export function useProSocket(wsUrl: string | undefined): UseProSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef({ attempts: 0, timer: 0 as unknown as ReturnType<typeof setTimeout> | 0 });
  const roomRef = useRef<string | null>(null);
  const youRef = useRef<PlayerView["you"] | null>(null);
  // Message we replay when a fresh socket opens (join intent or reconnect).
  const pendingHelloRef = useRef<ClientMsg | null>(null);

  const [status, setStatus] = useState<ProConnectionStatus>("idle");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<ProGameSnapshot | null>(null);
  const [opponentConnected, setOpponentConnected] = useState(true);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  const send = useCallback((msg: ClientMsg) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  const connect = useCallback(() => {
    if (!wsUrl) return;
    setStatus((s) => (s === "idle" || s === "connecting" ? "connecting" : "reconnecting"));
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      retryRef.current.attempts = 0;
      setStatus("open");
      const room = roomRef.current;
      const token = room ? sessionStorage.getItem(tokenKey(room)) : null;
      if (room && token) {
        send({ v: PROTOCOL_VERSION, type: "RECONNECT", roomId: room, token });
      } else if (pendingHelloRef.current) {
        send(pendingHelloRef.current);
        pendingHelloRef.current = null;
      }
    };

    ws.onmessage = (e) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      switch (msg.type) {
        case "ROOM_CREATED":
        case "ROOM_JOINED":
          roomRef.current = msg.roomId;
          setRoomId(msg.roomId);
          sessionStorage.setItem(tokenKey(msg.roomId), msg.token);
          break;
        case "STATE":
          youRef.current = msg.view.you;
          setSnapshot({ view: msg.view, legalActions: msg.legalActions, prompt: msg.view.prompt });
          break;
        case "OPPONENT_STATUS":
          setOpponentConnected(msg.connected);
          break;
        case "ERROR":
          setError({ code: msg.code, message: msg.message });
          break;
      }
    };

    ws.onclose = () => {
      if (wsRef.current !== ws) return; // superseded by a newer socket
      setStatus("closed");
      const delay = Math.min(1000 * 2 ** retryRef.current.attempts, MAX_RETRY_DELAY_MS);
      retryRef.current.attempts += 1;
      retryRef.current.timer = setTimeout(connect, delay);
    };
  }, [wsUrl, send]);

  useEffect(() => {
    if (!wsUrl) {
      setStatus("idle");
      return;
    }
    connect();
    const retry = retryRef.current;
    return () => {
      if (retry.timer) clearTimeout(retry.timer);
      const ws = wsRef.current;
      wsRef.current = null; // marks onclose as superseded
      ws?.close();
    };
  }, [wsUrl, connect]);

  const createRoom = useCallback(
    (heroId: string) => {
      const msg: ClientMsg = { v: PROTOCOL_VERSION, type: "CREATE_ROOM", heroId };
      if (wsRef.current?.readyState === WebSocket.OPEN) send(msg);
      else pendingHelloRef.current = msg;
    },
    [send]
  );

  const joinRoom = useCallback(
    (room: string, heroId: string) => {
      roomRef.current = room;
      setRoomId(room);
      const hasToken = !!sessionStorage.getItem(tokenKey(room));
      const msg: ClientMsg = hasToken
        ? { v: PROTOCOL_VERSION, type: "RECONNECT", roomId: room, token: sessionStorage.getItem(tokenKey(room))! }
        : { v: PROTOCOL_VERSION, type: "JOIN_ROOM", roomId: room, heroId };
      if (wsRef.current?.readyState === WebSocket.OPEN) send(msg);
      else pendingHelloRef.current = msg;
    },
    [send]
  );

  const sendAction = useCallback(
    (action: Action) => {
      if (roomRef.current)
        send({ v: PROTOCOL_VERSION, type: "ACTION", roomId: roomRef.current, action });
    },
    [send]
  );

  // Protocol v1: prompt answers are a regular action through the single ACTION
  // path (the server enumerates them in legalActions too).
  const respondToPrompt = useCallback(
    (promptId: string, optionId: string) => {
      if (roomRef.current && youRef.current)
        send({
          v: PROTOCOL_VERSION,
          type: "ACTION",
          roomId: roomRef.current,
          action: { type: "RESPOND_PROMPT", player: youRef.current, promptId, optionId },
        });
    },
    [send]
  );

  return {
    status,
    roomId,
    snapshot,
    opponentConnected,
    error,
    createRoom,
    joinRoom,
    sendAction,
    respondToPrompt,
  };
}
