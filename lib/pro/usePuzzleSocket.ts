/**
 * The socket behind one puzzle room (issue #1679 ↔ engine #1074, protocol v41).
 *
 * Why this is its own hook and not `useProSocket` with another option: a puzzle
 * room has none of what that hook is mostly made of. It lives on its OWN socket
 * and dies with it — no seat token, no RECONNECT, no resume blob, no undo, no
 * rematch, no move timer, no lobby, no slow mode — and it speaks five messages
 * `useProSocket` has no place for (PUZZLE_INFO / RESULT / HINT / SOLUTION /
 * CLOSED). What the two do share is the SHAPE the in-game view consumes, so
 * this hook returns a `UseProSocketReturn` (`socket`) with everything a puzzle
 * lacks pinned to its idle value, plus the puzzle's own state beside it.
 *
 * The client knows no rules here either: the goal, whether a try is solved,
 * the HP left, the hint and the solution all arrive from the server.
 *
 * Lifecycle: `enabled` + a `puzzleId` opens a socket and creates the room; a
 * new `puzzleId` (or `restart()`) drops that socket and opens a fresh one; a
 * close is final (`phase: "lost"`, or `"expired"` when the server dropped an
 * idle room), there is nothing to reconnect to. Unmount
 * closes the socket, and with it the server's room.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { FALLBACK_CONSTANTS } from "@/lib/account/cosmetics";
import { useAccount } from "@/lib/account/useAccount";
import { getAnalyticsId } from "@/lib/analytics";
import { identityFields } from "./playerIdentity";
import {
  PROTOCOL_VERSION,
  type Action,
  type ClientMsg,
  type HeroListing,
  type PlayerId,
  type PuzzleContext,
  type PuzzleSummary,
  type ServerMsg,
  type SpaceId,
} from "./protocol";
import { REMATCH_IDLE } from "./rematchOffer";
import { advanceRevealedHand, EMPTY_REVEAL_STATE, type RevealState } from "./revealedHand";
import { ACTION_IN_FLIGHT_MS, type ProGameSnapshot, type UseProSocketReturn } from "./useProSocket";

/** What the start of a try says (PUZZLE_INFO). */
export interface PuzzleRoomInfo {
  roomId: string;
  you: PlayerId;
  puzzle: PuzzleSummary;
  tryNumber: number;
  actionsAllowed: number;
  solutionShown: boolean;
}

/** How a try ended (PUZZLE_RESULT). */
export interface PuzzleTryResult {
  result: "solved" | "failed";
  tryNumber: number;
  seconds: number;
  hintUsed: boolean;
  solutionShown: boolean;
  enemyHeroHp?: number;
  sourceActual?: string;
  /** the room this result came from: a fresh room starts with none */
  roomId: string;
}

export type PuzzleSocketPhase =
  | "idle" // not enabled, or no puzzle chosen
  | "connecting" // socket opening, or the room not answered yet
  | "playing" // the first STATE of a room has arrived
  | "unavailable" // never got a room: no server, refused, unknown puzzle
  | "lost" // had a room, then the socket closed
  | "expired"; // the server dropped the room after its idle window (PUZZLE_CLOSED)

export interface UsePuzzleSocketReturn {
  /** What `<GameView socket>` consumes. */
  socket: UseProSocketReturn;
  phase: PuzzleSocketPhase;
  info: PuzzleRoomInfo | null;
  /** The current try's verdict, null while it is open (and after a reset). */
  result: PuzzleTryResult | null;
  /** The last hint's text for this try, ready to show. */
  hint: string | null;
  /** A played solution: null (none), "playing", or "done". */
  solution: "playing" | "done" | null;
  /**
   * Moves whenever the board starts over (a new room, a reset, a solution's
   * first frame): key the view on it so its log and transient state restart.
   */
  epoch: number;
  /** The solver hero is on the public roster (the full-game link may name it). */
  solverOnRoster: boolean;
  /** Same room, starting position, next try. */
  reset: () => void;
  requestHint: () => void;
  requestSolution: () => void;
  /** A FRESH room for the same puzzle (a new socket): `solutionShown` starts false again. */
  restart: () => void;
}

/** Errors that mean "no room for you", as opposed to a rejected action. */
const FATAL_CODES = new Set(["UNKNOWN_PUZZLE", "ROOM_LIMIT", "BAD_MESSAGE", "PUZZLE_UNSUPPORTED", "VERSION", "ROOM_NOT_FOUND"]);

const NOOP = () => {};
const EMPTY_PRESENCE = {};

interface Applied {
  snapshot: ProGameSnapshot;
  /** the PUZZLE_INFO that came just before this STATE, applied in the same render */
  info?: PuzzleRoomInfo;
  /** this STATE starts the board over */
  fresh?: boolean;
}

export function usePuzzleSocket(
  wsUrl: string | undefined,
  { puzzleId, context, enabled = true }: { puzzleId: string | null; context: PuzzleContext; enabled?: boolean }
): UsePuzzleSocketReturn {
  const account = useAccount();
  const accountRef = useRef(account);
  accountRef.current = account;
  const contextRef = useRef(context);
  contextRef.current = context;

  const wsRef = useRef<WebSocket | null>(null);
  const roomRef = useRef<string | null>(null);
  const youRef = useRef<PlayerId | null>(null);
  const hadStateRef = useRef(false);
  const actionsInFlightRef = useRef<Map<string, number>>(new Map());

  const [phase, setPhase] = useState<PuzzleSocketPhase>("idle");
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<ProGameSnapshot | null>(null);
  const [info, setInfo] = useState<PuzzleRoomInfo | null>(null);
  const [result, setResult] = useState<PuzzleTryResult | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [solution, setSolution] = useState<"playing" | "done" | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [heroes, setHeroes] = useState<HeroListing[] | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [illegalAction, setIllegalAction] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [serverError, setServerError] = useState(false);
  const [revealState, setRevealState] = useState<RevealState>(EMPTY_REVEAL_STATE);
  const revealRef = useRef<RevealState>(EMPTY_REVEAL_STATE);
  const [generation, setGeneration] = useState(0);

  // One snapshot per macrotask, as in useProSocket: the visitor's action and the
  // responder's reply land back to back, and two `setSnapshot`s in one tick
  // would render only the second — the view's log and combat beats diff on each.
  const queueRef = useRef<Applied[]>([]);
  const drainTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drain = useCallback(function drainOne() {
    drainTimerRef.current = null;
    const next = queueRef.current.shift();
    if (!next) return;
    if (next.fresh) {
      revealRef.current = EMPTY_REVEAL_STATE;
      setEpoch((n) => n + 1);
    }
    revealRef.current = advanceRevealedHand(revealRef.current, next.snapshot.events, next.snapshot.view.turnNumber);
    setRevealState(revealRef.current);
    if (next.info) setInfo(next.info);
    setSnapshot(next.snapshot);
    setPhase("playing");
    if (queueRef.current.length > 0) drainTimerRef.current = setTimeout(drainOne, 0);
  }, []);
  const push = useCallback(
    (item: Applied) => {
      queueRef.current.push(item);
      if (drainTimerRef.current === null) drain();
    },
    [drain]
  );
  const clearQueue = useCallback(() => {
    if (drainTimerRef.current) clearTimeout(drainTimerRef.current);
    drainTimerRef.current = null;
    queueRef.current = [];
  }, []);

  const send = useCallback((msg: ClientMsg) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  useEffect(() => {
    if (!enabled || !puzzleId) {
      setPhase("idle");
      return;
    }
    if (!wsUrl || typeof WebSocket === "undefined") {
      setPhase("unavailable");
      return;
    }
    // A new room: nothing of the last one carries over.
    roomRef.current = null;
    youRef.current = null;
    hadStateRef.current = false;
    actionsInFlightRef.current.clear();
    clearQueue();
    setPhase("connecting");
    setOpen(false);
    setSnapshot(null);
    setInfo(null);
    setResult(null);
    setHint(null);
    setSolution(null);
    setError(null);

    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      setPhase("unavailable");
      return;
    }
    wsRef.current = ws;
    let alive = true;
    // PUZZLE_INFO always precedes its try's first STATE: held until that STATE so
    // the header and the board change in one render.
    let pendingInfo: PuzzleRoomInfo | null = null;
    let freshNext = true;

    ws.onopen = () => {
      if (!alive) return;
      setOpen(true);
      const analyticsId = getAnalyticsId();
      const { playerId, displayName } = identityFields(accountRef.current);
      ws.send(
        JSON.stringify({
          v: PROTOCOL_VERSION,
          type: "CREATE_PUZZLE_ROOM",
          puzzleId,
          context: contextRef.current,
          ...(analyticsId ? { analyticsId } : {}),
          ...(playerId ? { playerId } : {}),
          ...(displayName ? { displayName } : {}),
        } satisfies ClientMsg)
      );
      // The roster: whether the solver hero can be offered for a full game.
      ws.send(JSON.stringify({ v: PROTOCOL_VERSION, type: "LIST_HEROES" } satisfies ClientMsg));
    };

    ws.onmessage = (e) => {
      if (!alive) return;
      let msg: ServerMsg;
      try {
        msg = JSON.parse(String((e as MessageEvent).data));
      } catch {
        return;
      }
      switch (msg.type) {
        case "HEROES":
          setHeroes(msg.heroes);
          break;
        case "PUZZLE_INFO":
          roomRef.current = msg.roomId;
          youRef.current = msg.you;
          pendingInfo = {
            roomId: msg.roomId,
            you: msg.you,
            puzzle: msg.puzzle,
            tryNumber: msg.tryNumber,
            actionsAllowed: msg.actionsAllowed,
            solutionShown: msg.solutionShown,
          };
          freshNext = true;
          // A new try: the last one's verdict, hint and played solution are over.
          setResult(null);
          setHint(null);
          setSolution(null);
          break;
        case "STATE": {
          hadStateRef.current = true;
          actionsInFlightRef.current.clear();
          youRef.current = msg.view.you;
          push({
            snapshot: { view: msg.view, legalActions: msg.legalActions, prompt: msg.view.prompt, events: msg.events ?? [] },
            ...(pendingInfo ? { info: pendingInfo } : {}),
            ...(freshNext ? { fresh: true } : {}),
          });
          pendingInfo = null;
          freshNext = false;
          break;
        }
        case "PUZZLE_RESULT":
          setResult({
            result: msg.result,
            tryNumber: msg.tryNumber,
            seconds: msg.seconds,
            hintUsed: msg.hintUsed,
            solutionShown: msg.solutionShown,
            ...(msg.enemyHeroHp !== undefined ? { enemyHeroHp: msg.enemyHeroHp } : {}),
            ...(msg.sourceActual ? { sourceActual: msg.sourceActual } : {}),
            roomId: msg.roomId,
          });
          break;
        case "PUZZLE_HINT":
          setHint(msg.text);
          break;
        case "PUZZLE_SOLUTION":
          setSolution(msg.status);
          if (msg.status === "playing") {
            // The try it interrupts is over; the next STATE is the starting position.
            setResult(null);
            setHint(null);
            freshNext = true;
          }
          break;
        case "PUZZLE_CLOSED":
          // The server dropped an idle room; the socket is of no further use.
          // `restart()` opens a fresh room (the caller decides when).
          alive = false;
          setOpen(false);
          setPhase("expired");
          ws.close();
          break;
        case "ERROR":
          actionsInFlightRef.current.clear();
          if (msg.code === "ILLEGAL_ACTION" || msg.code === "NOT_YOUR_SEAT") setIllegalAction(true);
          else if (msg.code === "RATE_LIMITED") setRateLimited(true);
          else if (msg.code === "SERVER_ERROR") setServerError(true);
          else if (FATAL_CODES.has(msg.code) || !hadStateRef.current) {
            setError({ code: msg.code, message: msg.message });
            setPhase(hadStateRef.current ? "lost" : "unavailable");
            alive = false;
            ws.close();
          }
          break;
        default:
          break;
      }
    };

    const onGone = () => {
      if (!alive) return;
      alive = false;
      setOpen(false);
      setPhase(hadStateRef.current ? "lost" : "unavailable");
    };
    ws.onclose = onGone;
    ws.onerror = onGone;

    return () => {
      alive = false;
      clearQueue();
      ws.onopen = null;
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
      try {
        ws.close();
      } catch {
        /* already closed */
      }
      if (wsRef.current === ws) wsRef.current = null;
    };
  }, [wsUrl, puzzleId, enabled, generation, push, clearQueue]);

  const claimActionSlot = useCallback((action: Action) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return false;
    const now = Date.now();
    const inFlight = actionsInFlightRef.current;
    for (const [key, sentAt] of inFlight) if (now - sentAt >= ACTION_IN_FLIGHT_MS) inFlight.delete(key);
    const key = JSON.stringify(action);
    if (inFlight.has(key)) return false;
    inFlight.set(key, now);
    return true;
  }, []);

  const sendAction = useCallback(
    (action: Action): boolean => {
      if (!roomRef.current || !claimActionSlot(action)) return false;
      send({ v: PROTOCOL_VERSION, type: "ACTION", roomId: roomRef.current, action });
      return true;
    },
    [send, claimActionSlot]
  );

  const respondToPrompt = useCallback(
    (promptId: string, optionId: string, path?: SpaceId[]): boolean => {
      if (!roomRef.current || !youRef.current) return false;
      const action: Action = {
        type: "RESPOND_PROMPT",
        player: youRef.current,
        promptId,
        optionId,
        ...(path && path.length > 0 ? { path } : {}),
      };
      if (!claimActionSlot(action)) return false;
      send({ v: PROTOCOL_VERSION, type: "ACTION", roomId: roomRef.current, action });
      return true;
    },
    [send, claimActionSlot]
  );

  const reset = useCallback(() => {
    if (roomRef.current) send({ v: PROTOCOL_VERSION, type: "PUZZLE_RESET", roomId: roomRef.current });
  }, [send]);
  const requestHint = useCallback(() => {
    if (roomRef.current) send({ v: PROTOCOL_VERSION, type: "PUZZLE_HINT_REQUEST", roomId: roomRef.current });
  }, [send]);
  const requestSolution = useCallback(() => {
    if (roomRef.current) send({ v: PROTOCOL_VERSION, type: "PUZZLE_SOLUTION_REQUEST", roomId: roomRef.current });
  }, [send]);
  const restart = useCallback(() => setGeneration((n) => n + 1), []);

  const acknowledgeIllegalAction = useCallback(() => setIllegalAction(false), []);
  const acknowledgeRateLimited = useCallback(() => setRateLimited(false), []);
  const acknowledgeServerError = useCallback(() => setServerError(false), []);

  const roomId = info?.roomId ?? null;
  const socket = useMemo<UseProSocketReturn>(
    () => ({
      status: phase === "idle" ? "idle" : open ? "open" : phase === "connecting" ? "connecting" : "closed",
      stale: false,
      cosmeticHeroes: [],
      cosmeticConstants: FALLBACK_CONSTANTS,
      cosmeticsStatus: "guest",
      identitySettled: true,
      roomId,
      roomInfo: null,
      snapshot,
      opponentConnected: true,
      seatPresence: EMPTY_PRESENCE,
      turnTimer: null,
      ownTimerExpired: false,
      acknowledgeOwnTimerExpired: NOOP,
      error,
      heroes,
      lobbies: null,
      roomPublic: false,
      replayBundle: null,
      createRoom: NOOP,
      joinRoom: NOOP,
      trackHeroPicked: NOOP,
      sendAction,
      respondToPrompt,
      requestUndo: NOOP,
      respondToUndo: NOOP,
      incomingUndo: null,
      undoPending: false,
      undoRejected: false,
      acknowledgeUndoRejected: NOOP,
      undoUnavailable: false,
      acknowledgeUndoUnavailable: NOOP,
      serverError,
      acknowledgeServerError,
      rateLimited,
      acknowledgeRateLimited,
      illegalAction,
      acknowledgeIllegalAction,
      resyncing: false,
      requestLobbies: NOOP,
      setVisibility: NOOP,
      serverRestarting: false,
      gameLost: phase === "lost",
      seatReplaced: false,
      seatReleasedRoom: null,
      takeSeatBack: NOOP,
      closeForGood: NOOP,
      rematchNegotiable: false,
      rematchOffer: REMATCH_IDLE,
      offerRematch: NOOP,
      cancelRematch: NOOP,
      respondToRematch: NOOP,
      slowModeHeld: null,
      slowModePending: 0,
      advanceSlowMode: NOOP,
      skipSlowMode: NOOP,
      revealState,
    }),
    [phase, open, roomId, snapshot, error, heroes, sendAction, respondToPrompt, serverError, acknowledgeServerError, rateLimited, acknowledgeRateLimited, illegalAction, acknowledgeIllegalAction, revealState]
  );

  const solverId = info?.puzzle.heroes.solver.id;
  const solverOnRoster = !!solverId && !!heroes?.some((h) => h.heroId === solverId);

  return { socket, phase, info, result, hint, solution, epoch, solverOnRoster, reset, requestHint, requestSolution, restart };
}
