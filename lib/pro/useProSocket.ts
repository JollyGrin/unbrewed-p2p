/**
 * Thin WebSocket client for the Pro server. No rules logic — it ships
 * ClientMsg out and hands ServerMsg payloads to React state.
 *
 * Endpoint comes from NEXT_PUBLIC_PRO_WS_URL, defaulting to the live Railway
 * server (see WS_URL in pages/pro/game.tsx).
 *
 * Reconnect: on ROOM_CREATED/ROOM_JOINED the server issues a token; we keep it
 * in localStorage (plus a recent-rooms index — see lib/pro/recentRooms.ts) and
 * replay RECONNECT on the next socket open for the same room.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  forgetRoom,
  getResumeToken,
  getTabToken,
  getToken,
  rememberRoom,
  setResumeToken,
  setToken,
} from "./recentRooms";
import {
  Action,
  BotDifficulty,
  ClientMsg,
  GameEvent,
  HeroListing,
  LobbyListing,
  PlayerView,
  PlayerId,
  ProMapDef,
  PROTOCOL_VERSION,
  ReplayBundle,
  ServerMsg,
  UndoActionSummary,
  ViewPrompt,
} from "./protocol";

/** An incoming undo request pushed to the opponent (protocol v11). */
export interface IncomingUndo {
  requester: PlayerId;
  rewindActions: UndoActionSummary[];
}

export type ProConnectionStatus =
  | "idle" // no URL configured
  | "connecting"
  | "open"
  | "reconnecting"
  | "closed";

export interface ProRoomInfo {
  formatId: string;
  seats: PlayerId[];
  requiredPlayers: number;
}

export interface ProGameSnapshot {
  view: PlayerView;
  legalActions: Action[];
  prompt: ViewPrompt | null; // convenience alias of view.prompt
  /**
   * Structured engine events for the action that produced THIS broadcast,
   * redacted per player (protocol v10). Empty on join/reconnect/resume STATE
   * (the server omits `events` there) and on any pre-v10 server. Kept paired
   * with `view` so the log effect enriches the same batch's diff atomically.
   */
  events: GameEvent[];
}

export interface UseProSocketReturn {
  status: ProConnectionStatus;
  roomId: string | null;
  roomInfo: ProRoomInfo | null;
  snapshot: ProGameSnapshot | null;
  opponentConnected: boolean;
  error: { code: string; message: string } | null;
  /** server-fed roster; null until the first HEROES reply arrives */
  heroes: HeroListing[] | null;
  /** open public lobbies; null until the first LOBBIES reply arrives */
  lobbies: LobbyListing[] | null;
  /** whether OUR current room is publicly listed (server-acked) */
  roomPublic: boolean;
  /** the self-contained bundle pushed at GAME_OVER (v7), for saving to Replays */
  replayBundle: ReplayBundle | null;
  /**
   * Pass `bot` to play vs the server's scripted AI (protocol v3). Pass
   * `customMap` to playtest an unpublished board (protocol v4); the two compose.
   */
  createRoom: (
    heroId: string,
    bot?: { difficulty: BotDifficulty; heroId?: string },
    customMap?: ProMapDef,
    formatId?: string
  ) => void;
  joinRoom: (roomId: string, heroId: string) => void;
  sendAction: (action: Action) => void;
  respondToPrompt: (promptId: string, optionId: string) => void;
  /**
   * Undo (protocol v11). `requestUndo` asks the server to rewind our last
   * discrete action, pending the opponent's consent; `respondToUndo` answers an
   * incoming request. `incomingUndo` is the request pushed to US (drive the
   * accept/reject modal); `undoPending` is true while OUR request awaits a
   * verdict; `undoRejected` latches true once the opponent declines (call
   * `acknowledgeUndoRejected` after showing the notice); `undoUnavailable`
   * latches true when the server answers ERROR{ UNDO_UNAVAILABLE } — nothing to
   * undo or one already pending (call `acknowledgeUndoUnavailable` after the
   * notice). See useProSocket for the lifecycle — both clear on the next STATE
   * (accept rewind, or the requester acting again invalidates the request).
   */
  requestUndo: () => void;
  respondToUndo: (accept: boolean) => void;
  incomingUndo: IncomingUndo | null;
  undoPending: boolean;
  undoRejected: boolean;
  acknowledgeUndoRejected: () => void;
  undoUnavailable: boolean;
  acknowledgeUndoUnavailable: () => void;
  /** ask the server for the current public-lobby list (poll while browsing) */
  requestLobbies: () => void;
  /** list/unlist our current room in the public lobby browser */
  setVisibility: (isPublic: boolean) => void;
  /**
   * True between a `SERVER_RESTARTING` warning (the server is redeploying) and
   * the next `STATE` (the game resumed on the new instance). The UI shows a
   * "server updating — reconnecting…" toast while it's true.
   */
  serverRestarting: boolean;
  /**
   * Terminal loss of a live game (issue #133): the server restarted (or our seat
   * token was rejected) and the game could NOT be resumed — either the resume was
   * explicitly rejected (ERROR after a RESUME_ROOM, or RESUME_FAILED), or no STATE
   * came back within RESUME_DEADLINE_MS of a SERVER_RESTARTING. Only ever set once
   * we've actually been in a live game (a STATE arrived); a successful resume — or
   * a resume that is merely slow — never sets it. The UI shows a "game lost"
   * apology instead of hanging on "waiting for game state".
   */
  gameLost: boolean;
}

const MAX_RETRY_DELAY_MS = 10_000;

/**
 * After a SERVER_RESTARTING, how long we wait for the game to come back (a STATE
 * on the new instance) before declaring it genuinely lost. Deliberately generous:
 * a redeploy plus reconnect backoff (up to MAX_RETRY_DELAY_MS per attempt) can
 * take a while, and we must NEVER show the "game lost" screen for a resume that
 * was only slow. A resume that succeeds clears the deadline the moment its STATE
 * (or revived ROOM_JOINED) arrives.
 */
const RESUME_DEADLINE_MS = 45_000;

export function useProSocket(wsUrl: string | undefined): UseProSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef({ attempts: 0, timer: 0 as unknown as ReturnType<typeof setTimeout> | 0 });
  const roomRef = useRef<string | null>(null);
  const youRef = useRef<PlayerView["you"] | null>(null);
  // Message we replay when a fresh socket opens (join intent or reconnect).
  const pendingHelloRef = useRef<ClientMsg | null>(null);
  // True while a RESUME_ROOM is in flight — so a resume that itself fails (bad
  // blob / diverged game) surfaces the error instead of looping back into resume.
  const resumingRef = useRef(false);
  // True once we've received at least one STATE for the current game — i.e. we
  // were genuinely mid-match. Gates the "game lost" screen so a pre-join error
  // (bad ?room= link) never masquerades as a lost game.
  const hadStateRef = useRef(false);
  // Live timer that fires if a SERVER_RESTARTING isn't followed by a resume
  // within RESUME_DEADLINE_MS. Cleared on the resuming STATE/ROOM_JOINED.
  const resumeDeadlineRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [status, setStatus] = useState<ProConnectionStatus>("idle");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomInfo, setRoomInfo] = useState<ProRoomInfo | null>(null);
  const [snapshot, setSnapshot] = useState<ProGameSnapshot | null>(null);
  const [opponentConnected, setOpponentConnected] = useState(true);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [heroes, setHeroes] = useState<HeroListing[] | null>(null);
  const [lobbies, setLobbies] = useState<LobbyListing[] | null>(null);
  const [roomPublic, setRoomPublic] = useState(false);
  const [serverRestarting, setServerRestarting] = useState(false);
  const [replayBundle, setReplayBundle] = useState<ReplayBundle | null>(null);
  const [gameLost, setGameLost] = useState(false);
  // Undo (v11): the request pushed to US (opponent prompt), our own request's
  // pending flag, and a latch for "opponent declined". Any STATE clears the first
  // two — an accept arrives as a rewind STATE, and the requester acting again
  // (which invalidates a pending request) also broadcasts a STATE to both seats.
  const [incomingUndo, setIncomingUndo] = useState<IncomingUndo | null>(null);
  const [undoPending, setUndoPending] = useState(false);
  const [undoRejected, setUndoRejected] = useState(false);
  const [undoUnavailable, setUndoUnavailable] = useState(false);

  const send = useCallback((msg: ClientMsg) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  // Cancel the pending "game lost" deadline — a resume succeeded (or we're
  // starting fresh), so the terminal-failure timer must not fire.
  const clearResumeDeadline = useCallback(() => {
    if (resumeDeadlineRef.current) {
      clearTimeout(resumeDeadlineRef.current);
      resumeDeadlineRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!wsUrl) return;
    setStatus((s) => (s === "idle" || s === "connecting" ? "connecting" : "reconnecting"));
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      retryRef.current.attempts = 0;
      setStatus("open");
      // Ask for the roster on every open (incl. reconnects) — one tiny message,
      // idempotent; the reply feeds the game page's hero picker.
      send({ v: PROTOCOL_VERSION, type: "LIST_HEROES" });
      const room = roomRef.current;
      const token = room ? getToken(room) : null;
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
        case "HEROES":
          setHeroes(msg.heroes);
          break;
        case "LOBBIES":
          setLobbies(msg.lobbies);
          break;
        case "VISIBILITY":
          if (msg.roomId === roomRef.current) setRoomPublic(msg.public);
          break;
        case "ROOM_CREATED":
        case "ROOM_JOINED":
          roomRef.current = msg.roomId;
          setRoomId(msg.roomId);
          setRoomInfo({
            formatId: msg.formatId ?? "duel",
            seats: msg.seats ?? [msg.you],
            requiredPlayers: msg.requiredPlayers ?? 2,
          });
          setRoomPublic(false); // fresh rooms are private until acked otherwise
          setToken(msg.roomId, msg.token); // fresh reconnect token (revive rotates it)
          rememberRoom(msg.roomId);
          resumingRef.current = false; // a revive that reached ROOM_JOINED succeeded
          setServerRestarting(false);
          clearResumeDeadline(); // a revive that reached ROOM_JOINED beat the deadline
          break;
        case "STATE":
          youRef.current = msg.view.you;
          hadStateRef.current = true; // we're genuinely mid-match now
          setSnapshot({
            view: msg.view,
            legalActions: msg.legalActions,
            prompt: msg.view.prompt,
            events: msg.events ?? [],
          });
          setServerRestarting(false); // a STATE means we're live again (resume done)
          clearResumeDeadline(); // resume landed (or never failed) — cancel the loss timer
          setGameLost(false); // a late-but-successful resume wins over a fired deadline
          // v11: any STATE resolves a live undo negotiation. If we were waiting on
          // a verdict this is the accepted rewind (or the game simply moved on); if
          // we had an incoming request open, the requester acting again invalidated
          // it. Either way, drop the pending/incoming undo UI.
          setUndoPending(false);
          setIncomingUndo(null);
          break;
        case "RESUME_TOKEN":
          // Opaque, encrypted resume blob for our seat — stash it so a redeploy or
          // crash can revive this exact game via RESUME_ROOM. Never inspected.
          setResumeToken(msg.roomId, msg.token);
          break;
        case "SERVER_RESTARTING":
          // The old instance is shutting down (redeploy). Flag it for the toast;
          // the socket will close and the backoff loop reconnects to the new
          // instance, where RECONNECT/RESUME_ROOM revives the game.
          setServerRestarting(true);
          // Arm the terminal-failure deadline: if no STATE/ROOM_JOINED lands
          // within RESUME_DEADLINE_MS the game is declared lost (issue #133).
          // Only meaningful once we've actually been in a live game.
          if (hadStateRef.current && !resumeDeadlineRef.current) {
            resumeDeadlineRef.current = setTimeout(() => {
              resumeDeadlineRef.current = null;
              setServerRestarting(false); // drop the "reconnecting…" toast — it's over
              setGameLost(true);
            }, RESUME_DEADLINE_MS);
          }
          break;
        case "REPLAY_BUNDLE":
          // Pushed to both seats at GAME_OVER — nothing is secret anymore. Held for
          // the game page to save into the local Replays store.
          setReplayBundle(msg.bundle);
          break;
        case "OPPONENT_STATUS":
          setOpponentConnected(msg.connected);
          break;
        case "UNDO_REQUESTED":
          // The opponent asked to undo; surface the accept/reject prompt with the
          // list of actions that will be rewound (incl. our own intervening moves).
          setIncomingUndo({ requester: msg.requester, rewindActions: msg.rewindActions });
          break;
        case "UNDO_REJECTED":
          // The opponent declined our undo — stop waiting and latch the notice.
          setUndoPending(false);
          setUndoRejected(true);
          break;
        case "ERROR": {
          // Undo couldn't be honored (nothing to undo, or one already pending) —
          // a benign race despite canUndo-gating (double-request, or the undo
          // boundary shifted under us). Clear our pending-undo UI and surface a
          // light "nothing to undo" notice, NOT the terminal error / loss path.
          if (msg.code === "UNDO_UNAVAILABLE") {
            setUndoPending(false);
            setUndoUnavailable(true);
            break;
          }
          // A room lost to a redeploy answers ROOM_NOT_FOUND (room gone) or
          // BAD_TOKEN (already revived by the other client, our old seat token no
          // longer matches). If we hold a resume blob for it, revive rather than
          // give up — unless the in-flight message WAS a resume (then it truly failed).
          const room = roomRef.current;
          const blob = room ? getResumeToken(room) : null;
          const recoverable = msg.code === "ROOM_NOT_FOUND" || msg.code === "BAD_TOKEN";
          if (recoverable && blob && !resumingRef.current) {
            resumingRef.current = true;
            send({ v: PROTOCOL_VERSION, type: "RESUME_ROOM", token: blob });
            break; // don't surface an error — a resume attempt is underway
          }
          // Resume genuinely failed, or nothing to resume: forget a dead room and show it.
          resumingRef.current = false;
          setServerRestarting(false);
          clearResumeDeadline();
          if ((msg.code === "ROOM_NOT_FOUND" || msg.code === "RESUME_FAILED") && room) forgetRoom(room);
          setError({ code: msg.code, message: msg.message });
          // If this terminal failure struck a game we were actually playing, it's
          // a genuine loss (resume rejected / room gone / seat token dead) — show
          // the apology screen rather than a bare error (issue #133). A pre-join
          // error (bad ?room= link, never got a STATE) keeps the existing screens.
          if (hadStateRef.current) setGameLost(true);
          break;
        }
      }
    };

    ws.onclose = () => {
      if (wsRef.current !== ws) return; // superseded by a newer socket
      setStatus("closed");
      const delay = Math.min(1000 * 2 ** retryRef.current.attempts, MAX_RETRY_DELAY_MS);
      retryRef.current.attempts += 1;
      retryRef.current.timer = setTimeout(connect, delay);
    };
  }, [wsUrl, send, clearResumeDeadline]);

  useEffect(() => {
    if (!wsUrl) {
      setStatus("idle");
      return;
    }
    connect();
    const retry = retryRef.current;
    return () => {
      if (retry.timer) clearTimeout(retry.timer);
      clearResumeDeadline();
      const ws = wsRef.current;
      wsRef.current = null; // marks onclose as superseded
      ws?.close();
    };
  }, [wsUrl, connect, clearResumeDeadline]);

  const createRoom = useCallback(
    (heroId: string, bot?: { difficulty: BotDifficulty; heroId?: string }, customMap?: ProMapDef, formatId?: string) => {
      setError(null); // clear any prior room/hero error on a fresh attempt
      setGameLost(false); // starting a brand-new game — no lost game to mourn
      hadStateRef.current = false;
      clearResumeDeadline();
      const msg: ClientMsg = {
        v: PROTOCOL_VERSION,
        type: "CREATE_ROOM",
        heroId,
        ...(bot ? { bot } : {}),
        ...(customMap ? { customMap } : {}),
        ...(formatId && formatId !== "duel" ? { formatId } : {}),
      };
      if (wsRef.current?.readyState === WebSocket.OPEN) send(msg);
      else pendingHelloRef.current = msg;
    },
    [send, clearResumeDeadline]
  );

  const joinRoom = useCallback(
    (room: string, heroId: string) => {
      setError(null); // clear any prior room/hero error on a fresh attempt
      setGameLost(false); // fresh join/resume attempt — drop any prior lost state
      clearResumeDeadline();
      roomRef.current = room;
      setRoomId(room);
      // heroId === "" is an explicit resume (refresh flow / recent-rooms strip)
      // and may use any token this browser holds. A join WITH a hero only
      // reclaims THIS TAB's seat — never a token another tab wrote, or the
      // second tab of a two-tab solo test would steal the host's seat.
      const token = heroId === "" ? getToken(room) : getTabToken(room);
      const msg: ClientMsg = token
        ? { v: PROTOCOL_VERSION, type: "RECONNECT", roomId: room, token }
        : { v: PROTOCOL_VERSION, type: "JOIN_ROOM", roomId: room, heroId };
      if (wsRef.current?.readyState === WebSocket.OPEN) send(msg);
      else pendingHelloRef.current = msg;
    },
    [send, clearResumeDeadline]
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

  // Undo (v11): meta-negotiation, sent OUTSIDE the ACTION path so it never enters
  // the deterministic replay log. requestUndo optimistically enters the pending
  // state; the server pushes UNDO_REQUESTED to the opponent and answers with either
  // a rewind STATE (accept) or UNDO_REJECTED (reject).
  const requestUndo = useCallback(() => {
    if (!roomRef.current) return;
    setUndoRejected(false); // fresh attempt clears any stale "declined" notice
    setUndoUnavailable(false); // …and any stale "nothing to undo" notice
    setUndoPending(true);
    send({ v: PROTOCOL_VERSION, type: "UNDO_REQUEST", roomId: roomRef.current });
  }, [send]);

  const respondToUndo = useCallback(
    (accept: boolean) => {
      if (!roomRef.current) return;
      setIncomingUndo(null); // consumed — hide the prompt whichever way we answered
      send({ v: PROTOCOL_VERSION, type: "UNDO_RESPONSE", roomId: roomRef.current, accept });
    },
    [send]
  );

  const acknowledgeUndoRejected = useCallback(() => setUndoRejected(false), []);
  const acknowledgeUndoUnavailable = useCallback(() => setUndoUnavailable(false), []);

  const requestLobbies = useCallback(() => {
    send({ v: PROTOCOL_VERSION, type: "LIST_LOBBIES" });
  }, [send]);

  const setVisibility = useCallback(
    (isPublic: boolean) => {
      if (roomRef.current)
        send({ v: PROTOCOL_VERSION, type: "SET_VISIBILITY", roomId: roomRef.current, public: isPublic });
    },
    [send]
  );

  return {
    status,
    roomId,
    roomInfo,
    snapshot,
    opponentConnected,
    error,
    heroes,
    lobbies,
    roomPublic,
    replayBundle,
    createRoom,
    joinRoom,
    sendAction,
    respondToPrompt,
    requestUndo,
    respondToUndo,
    incomingUndo,
    undoPending,
    undoRejected,
    acknowledgeUndoRejected,
    undoUnavailable,
    acknowledgeUndoUnavailable,
    requestLobbies,
    setVisibility,
    serverRestarting,
    gameLost,
  };
}
