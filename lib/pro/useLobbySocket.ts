/**
 * The `/pro/game` picker's presence socket (issue #1542 ↔ engine #1034).
 *
 * A second, thin websocket at `<PRO_WS_URL>/lobby` speaking `lib/pro/lobbyProtocol.ts`
 * (v1) — NOT the game protocol. It is open only while the player sits on the hero
 * picker: the page passes `enabled: false` the moment it takes a seat on the game
 * socket (CREATE_ROOM / JOIN_ROOM / RECONNECT / RESUME_ROOM) and `true` again on
 * the way back. A Quick Match search is the exception: it stays open as
 * `searching` until the game starts, and the page counts that player once
 * (`presentCount` in quickPlayLobby.ts) though it is also hosting a listed lobby.
 *
 * - HELLO once per socket (re-sent when the identity settles or changes), with the
 *   same displayName/badge/badges/playerId a CREATE_ROOM would carry
 *   (`identityFields`, so a guest sends none of them).
 * - STATE whenever the presence state or hero changes. A hidden tab reads as
 *   `idle` (the "away" dot on the ribbon), a visible one as the page asked.
 * - Reconnects with the same full-jitter backoff as useProSocket.
 *
 * An engine without `/lobby` routes the upgrade to its GAME socket, which answers
 * our HELLO with a game-protocol ERROR. Any ERROR before the first SNAPSHOT marks
 * the lobby unsupported for this page load: the socket closes, nothing retries,
 * and every surface falls back to the LIST_LOBBIES poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "@/lib/account/useAccount";
import { useBadges } from "@/lib/account/useBadges";
import { identityFields } from "./playerIdentity";
import {
  LOBBY_PROTOCOL_VERSION,
  type LobbyClientMsg,
  type LobbyPresenceState,
  type LobbyServerMsg,
  type PresenceEntry,
} from "./lobbyProtocol";

export type LobbySnapshot = Extract<LobbyServerMsg, { type: "SNAPSHOT" }>;
export type LobbyNudgeResult = Extract<LobbyServerMsg, { type: "NUDGE_RESULT" }>;

/** Same cap as useProSocket's reconnect loop. */
const MAX_RETRY_DELAY_MS = 10_000;

/** `<ws url>/lobby`, tolerating a trailing slash on the configured URL. */
export const lobbySocketUrl = (wsUrl: string): string => `${wsUrl.replace(/\/+$/, "")}/lobby`;

export interface UseLobbySocketOptions {
  /** the game socket's URL (`PRO_WS_URL`); undefined = never connect */
  wsUrl: string | undefined;
  /** open while true; closed (and the snapshot dropped) while false */
  enabled: boolean;
  /** what this player is doing; a hidden tab downgrades `picking` to `idle` */
  state: Exclude<LobbyPresenceState, "idle">;
  /** the fighter currently locked on the picker, if any */
  heroId?: string | null;
  /** someone 👋'd us */
  onNudged?: (from: PresenceEntry) => void;
  /** the server's answer to our own 👋 */
  onNudgeResult?: (result: LobbyNudgeResult) => void;
}

export interface UseLobbySocketReturn {
  /** the latest SNAPSHOT; null while closed, connecting, or unsupported */
  snapshot: LobbySnapshot | null;
  /** send 👋 to a `PresenceEntry.id` from the last snapshot */
  nudge: (to: string) => void;
}

const useDocumentHidden = (): boolean => {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const update = () => setHidden(document.visibilityState === "hidden");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return hidden;
};

export function useLobbySocket({
  wsUrl,
  enabled,
  state,
  heroId = null,
  onNudged,
  onNudgeResult,
}: UseLobbySocketOptions): UseLobbySocketReturn {
  const [snapshot, setSnapshot] = useState<LobbySnapshot | null>(null);
  const hidden = useDocumentHidden();
  const presence: LobbyPresenceState = state === "picking" && hidden ? "idle" : state;

  // Everything the socket handlers read goes through refs, so a change never
  // re-creates the connection — only `wsUrl` / `enabled` do.
  const account = useAccount();
  const badges = useBadges();
  const identity = identityFields(account, badges.selected);
  const identityKey = JSON.stringify(identity);
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const presenceRef = useRef({ state: presence, heroId });
  presenceRef.current = { state: presence, heroId };
  const onNudgedRef = useRef(onNudged);
  onNudgedRef.current = onNudged;
  const onNudgeResultRef = useRef(onNudgeResult);
  onNudgeResultRef.current = onNudgeResult;

  const wsRef = useRef<WebSocket | null>(null);
  const helloedRef = useRef(false);
  // Set by an ERROR before any SNAPSHOT: this engine has no lobby socket.
  const unsupportedRef = useRef(false);

  const send = useCallback((msg: LobbyClientMsg) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(msg));
  }, []);

  const sendHello = useCallback(() => {
    const { state: s, heroId: h } = presenceRef.current;
    send({
      v: LOBBY_PROTOCOL_VERSION,
      type: "HELLO",
      state: s,
      ...(h ? { heroId: h } : {}),
      ...identityRef.current,
    });
    helloedRef.current = true;
  }, [send]);

  useEffect(() => {
    if (!wsUrl || !enabled || unsupportedRef.current || typeof WebSocket === "undefined") {
      setSnapshot(null);
      return;
    }
    let disposed = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (disposed) return;
      const ws = new WebSocket(lobbySocketUrl(wsUrl));
      wsRef.current = ws;
      helloedRef.current = false;
      let gotSnapshot = false;
      ws.onopen = () => {
        if (wsRef.current !== ws) return;
        sendHello();
      };
      ws.onmessage = (e: MessageEvent) => {
        if (wsRef.current !== ws) return;
        let msg: LobbyServerMsg;
        try {
          msg = JSON.parse(String(e.data));
        } catch {
          return;
        }
        switch (msg?.type) {
          case "SNAPSHOT":
            gotSnapshot = true;
            attempts = 0;
            setSnapshot(msg);
            break;
          case "NUDGED":
            onNudgedRef.current?.(msg.from);
            break;
          case "NUDGE_RESULT":
            onNudgeResultRef.current?.(msg);
            break;
          case "ERROR":
            if (!gotSnapshot) {
              // Not a lobby socket (see the header). Stop for this page load.
              unsupportedRef.current = true;
              disposed = true;
              wsRef.current = null;
              ws.close();
              setSnapshot(null);
            }
            break;
          default:
            break;
        }
      };
      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        helloedRef.current = false;
        setSnapshot(null);
        if (disposed || unsupportedRef.current) return;
        const capped = Math.min(1000 * 2 ** attempts, MAX_RETRY_DELAY_MS);
        attempts += 1;
        timer = setTimeout(connect, Math.random() * capped);
      };
    };
    connect();

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      const ws = wsRef.current;
      wsRef.current = null;
      helloedRef.current = false;
      ws?.close();
      setSnapshot(null);
    };
  }, [wsUrl, enabled, sendHello]);

  // Presence moves: STATE on the live socket (HELLO already carried the first one).
  useEffect(() => {
    if (!helloedRef.current) return;
    send({ v: LOBBY_PROTOCOL_VERSION, type: "STATE", state: presence, ...(heroId ? { heroId } : {}) });
  }, [presence, heroId, send]);

  // The account/badges settle after mount: re-introduce ourselves so the ribbon
  // shows the name, not "Anonymous". The server allows a repeat HELLO.
  useEffect(() => {
    if (helloedRef.current) sendHello();
  }, [identityKey, sendHello]);

  const nudge = useCallback(
    (to: string) => send({ v: LOBBY_PROTOCOL_VERSION, type: "NUDGE", to }),
    [send],
  );

  return { snapshot, nudge };
}
