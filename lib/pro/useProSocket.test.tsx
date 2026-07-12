import { act, renderHook } from "@testing-library/react";
import { useProSocket } from "./useProSocket";

/**
 * Minimal fake WebSocket so we can drive the client's message handling without a
 * real server. Captures outbound frames and lets a test feed inbound ServerMsgs.
 */
class FakeWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;
  static last: FakeWebSocket | null = null;
  static instances = 0;

  url: string;
  readyState = FakeWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.last = this;
    FakeWebSocket.instances += 1;
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }

  // --- test drivers ---
  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }
  emit(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
  get sentTypes(): string[] {
    return this.sent.map((s) => JSON.parse(s).type);
  }
}

const minimalState = () => ({
  type: "STATE",
  view: { you: "p1", prompt: null, activePlayer: "p1" },
  legalActions: [],
});

const roomJoined = () => ({ type: "ROOM_JOINED", roomId: "R1", token: "tok", you: "p1" });

describe("useProSocket — SERVER_ERROR resilience (issue #178)", () => {
  const realWS = global.WebSocket;
  beforeEach(() => {
    // @ts-expect-error — swap in the fake for the test
    global.WebSocket = FakeWebSocket;
    window.localStorage.clear();
  });
  afterEach(() => {
    global.WebSocket = realWS;
    FakeWebSocket.last = null;
  });

  const bootIntoGame = () => {
    const hook = renderHook(() => useProSocket("ws://test"));
    const ws = FakeWebSocket.last!;
    act(() => ws.open());
    act(() => ws.emit(roomJoined()));
    act(() => ws.emit(minimalState()));
    return { hook, ws };
  };

  it("treats ERROR{SERVER_ERROR} as non-fatal: board stays live, no loss screen", () => {
    const { hook, ws } = bootIntoGame();
    expect(hook.result.current.snapshot).not.toBeNull();

    act(() => ws.emit({ type: "ERROR", code: "SERVER_ERROR", message: "boom in engine" }));

    // non-fatal notice latched, but the game is untouched
    expect(hook.result.current.serverError).toBe(true);
    expect(hook.result.current.gameLost).toBe(false);
    expect(hook.result.current.error).toBeNull();
    expect(hook.result.current.snapshot).not.toBeNull(); // board still interactive

    // and the player can still act — the socket is open, ACTION goes out
    act(() => hook.result.current.sendAction({ type: "END_TURN", player: "p1" } as never));
    expect(ws.sentTypes).toContain("ACTION");
  });

  it("acknowledgeServerError clears the one-shot latch", () => {
    const { hook, ws } = bootIntoGame();
    act(() => ws.emit({ type: "ERROR", code: "SERVER_ERROR", message: "x" }));
    expect(hook.result.current.serverError).toBe(true);
    act(() => hook.result.current.acknowledgeServerError());
    expect(hook.result.current.serverError).toBe(false);
  });

  it("still shows the recovery/loss path for a genuine terminal error after a live game", () => {
    const { hook, ws } = bootIntoGame();
    act(() => ws.emit({ type: "ERROR", code: "RESUME_FAILED", message: "gone" }));

    expect(hook.result.current.gameLost).toBe(true);
    expect(hook.result.current.error).toEqual({ code: "RESUME_FAILED", message: "gone" });
    expect(hook.result.current.serverError).toBe(false); // not the non-fatal path
  });

  it("does not reroute other ERROR codes through the SERVER_ERROR path", () => {
    const { hook, ws } = bootIntoGame();
    act(() => ws.emit({ type: "ERROR", code: "ILLEGAL_ACTION", message: "nope" }));

    expect(hook.result.current.serverError).toBe(false);
    expect(hook.result.current.error).toEqual({ code: "ILLEGAL_ACTION", message: "nope" });
  });
});

describe("useProSocket — RATE_LIMITED resilience (issue #209 / engine PR #103)", () => {
  const realWS = global.WebSocket;
  beforeEach(() => {
    // @ts-expect-error — swap in the fake for the test
    global.WebSocket = FakeWebSocket;
    window.localStorage.clear();
  });
  afterEach(() => {
    global.WebSocket = realWS;
    FakeWebSocket.last = null;
  });

  const bootIntoGame = () => {
    const hook = renderHook(() => useProSocket("ws://test"));
    const ws = FakeWebSocket.last!;
    act(() => ws.open());
    act(() => ws.emit(roomJoined()));
    act(() => ws.emit(minimalState()));
    return { hook, ws };
  };

  it("treats ERROR{RATE_LIMITED} as non-fatal: board stays live, socket stays open", () => {
    const { hook, ws } = bootIntoGame();
    expect(hook.result.current.snapshot).not.toBeNull();

    act(() => ws.emit({ type: "ERROR", code: "RATE_LIMITED", message: "too fast" }));

    // gentle notice latched; the game is untouched and no loss/disconnect
    expect(hook.result.current.rateLimited).toBe(true);
    expect(hook.result.current.gameLost).toBe(false);
    expect(hook.result.current.error).toBeNull();
    expect(hook.result.current.serverError).toBe(false);
    expect(hook.result.current.snapshot).not.toBeNull(); // board still interactive

    // and the player can still act on the same, still-open socket
    act(() => hook.result.current.sendAction({ type: "MANEUVER", player: "p1" } as never));
    expect(ws.sentTypes).toContain("ACTION");
  });

  it("acknowledgeRateLimited clears the one-shot latch", () => {
    const { hook, ws } = bootIntoGame();
    act(() => ws.emit({ type: "ERROR", code: "RATE_LIMITED", message: "x" }));
    expect(hook.result.current.rateLimited).toBe(true);
    act(() => hook.result.current.acknowledgeRateLimited());
    expect(hook.result.current.rateLimited).toBe(false);
  });

  it("does not open a fresh socket in response to RATE_LIMITED (no reconnect storm)", () => {
    const { hook, ws } = bootIntoGame();
    const socketCount = FakeWebSocket.instances;
    act(() => ws.emit({ type: "ERROR", code: "RATE_LIMITED", message: "slow down" }));
    // The client must NOT reconnect on its own — only a server-initiated close
    // triggers the (jittered) backoff loop.
    expect(FakeWebSocket.instances).toBe(socketCount);
    expect(hook.result.current.rateLimited).toBe(true);
  });

  it("surfaces ROOM_LIMIT on create as a non-fatal error (no loss screen)", () => {
    const hook = renderHook(() => useProSocket("ws://test"));
    const ws = FakeWebSocket.last!;
    act(() => ws.open());
    // Server is at its room cap — no STATE was ever received (pre-game).
    act(() => hook.result.current.createRoom("hero-a"));
    act(() => ws.emit({ type: "ERROR", code: "ROOM_LIMIT", message: "server full" }));

    expect(hook.result.current.error).toEqual({ code: "ROOM_LIMIT", message: "server full" });
    expect(hook.result.current.gameLost).toBe(false); // never the loss path pre-game
    expect(hook.result.current.rateLimited).toBe(false);
    expect(hook.result.current.snapshot).toBeNull();
  });

  it("reconnects with jittered backoff after a server-initiated close (delay < cap)", () => {
    jest.useFakeTimers();
    const randSpy = jest.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      renderHook(() => useProSocket("ws://test"));
      const ws = FakeWebSocket.last!;
      act(() => ws.open());
      const beforeClose = FakeWebSocket.instances;

      // Server drops the socket (e.g. after a repeated rate-limit breach).
      act(() => ws.close());

      // First backoff: capped = min(1000·2^0, 10000) = 1000ms; full jitter with
      // random=0.5 → 500ms. No new socket before then (not hammering).
      act(() => jest.advanceTimersByTime(499));
      expect(FakeWebSocket.instances).toBe(beforeClose);

      // …and it does reconnect once the jittered delay elapses.
      act(() => jest.advanceTimersByTime(2));
      expect(FakeWebSocket.instances).toBe(beforeClose + 1);
    } finally {
      randSpy.mockRestore();
      jest.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// Multi-lobby live fill + seat presence / auto-forfeit (issue #222, engine #121)
// ---------------------------------------------------------------------------

describe("useProSocket — ROOM_STATUS live waiting-room fill (issue #222)", () => {
  const realWS = global.WebSocket;
  beforeEach(() => {
    // @ts-expect-error — swap in the fake for the test
    global.WebSocket = FakeWebSocket;
    window.localStorage.clear();
  });
  afterEach(() => {
    global.WebSocket = realWS;
    FakeWebSocket.last = null;
  });

  const bootWaiting = () => {
    const hook = renderHook(() => useProSocket("ws://test"));
    const ws = FakeWebSocket.last!;
    act(() => ws.open());
    // 2v2 room, host is p1 — created but no game state yet (still waiting).
    act(() =>
      ws.emit({ type: "ROOM_CREATED", roomId: "R1", token: "tok", you: "p1", formatId: "team-2v2", seats: ["p1"], requiredPlayers: 4 })
    );
    return { hook, ws };
  };

  it("advances seat count and roster live as seats fill, preserving `you`", () => {
    const { hook, ws } = bootWaiting();
    expect(hook.result.current.roomInfo?.seats).toEqual(["p1"]);
    expect(hook.result.current.roomInfo?.roster).toBeUndefined();

    act(() =>
      ws.emit({
        type: "ROOM_STATUS",
        roomId: "R1",
        formatId: "team-2v2",
        requiredPlayers: 4,
        seats: [
          { player: "p1", heroId: "medusa", connected: true, bot: null },
          { player: "p2", heroId: "king-kong", connected: true, bot: null },
        ],
      })
    );

    const info = hook.result.current.roomInfo!;
    expect(info.seats).toEqual(["p1", "p2"]); // count advanced 1 → 2
    expect(info.you).toBe("p1"); // preserved from ROOM_CREATED
    expect(info.roster?.map((s) => s.heroId)).toEqual(["medusa", "king-kong"]);
  });

  it("renders a seat-count DROP gracefully (pre-game ghost-seat release)", () => {
    const { hook, ws } = bootWaiting();
    act(() =>
      ws.emit({
        type: "ROOM_STATUS",
        roomId: "R1",
        formatId: "team-2v2",
        requiredPlayers: 4,
        seats: [
          { player: "p1", heroId: "medusa", connected: true, bot: null },
          { player: "p2", heroId: "king-kong", connected: true, bot: null },
          { player: "p3", heroId: "bruce-lee", connected: true, bot: null },
        ],
      })
    );
    expect(hook.result.current.roomInfo?.seats).toHaveLength(3);

    // p3's ghost seat is released after its grace expires — count drops to 2.
    act(() =>
      ws.emit({
        type: "ROOM_STATUS",
        roomId: "R1",
        formatId: "team-2v2",
        requiredPlayers: 4,
        seats: [
          { player: "p1", heroId: "medusa", connected: true, bot: null },
          { player: "p2", heroId: "king-kong", connected: true, bot: null },
        ],
      })
    );
    expect(hook.result.current.roomInfo?.seats).toEqual(["p1", "p2"]);
    expect(hook.result.current.roomInfo?.roster).toHaveLength(2);
  });
});

describe("useProSocket — seat presence + auto-forfeit countdown (issue #222)", () => {
  const realWS = global.WebSocket;
  beforeEach(() => {
    // @ts-expect-error — swap in the fake for the test
    global.WebSocket = FakeWebSocket;
    window.localStorage.clear();
  });
  afterEach(() => {
    global.WebSocket = realWS;
    FakeWebSocket.last = null;
  });

  // A minimal multiplayer STATE with per-seat fighters we can mark defeated.
  const mpState = (over: { winner?: string; defeated?: string[] } = {}) => ({
    type: "STATE",
    view: {
      you: "p1",
      prompt: null,
      activePlayer: "p1",
      winner: over.winner ?? null,
      players: [{ id: "p1" }, { id: "p2" }, { id: "p3" }],
      fighters: [
        { owner: "p1", kind: "HERO", defeated: !!over.defeated?.includes("p1") },
        { owner: "p2", kind: "HERO", defeated: !!over.defeated?.includes("p2") },
        { owner: "p3", kind: "HERO", defeated: !!over.defeated?.includes("p3") },
      ],
    },
    legalActions: [],
  });

  const bootMpGame = () => {
    const hook = renderHook(() => useProSocket("ws://test"));
    const ws = FakeWebSocket.last!;
    act(() => ws.open());
    act(() => ws.emit({ type: "ROOM_JOINED", roomId: "R1", token: "tok", you: "p1", formatId: "ffa-3", seats: ["p1", "p2", "p3"], requiredPlayers: 3 }));
    act(() => ws.emit(mpState()));
    return { hook, ws };
  };

  it("records a disconnected seat + its auto-forfeit deadline, and clears on the all-clear", () => {
    const { hook, ws } = bootMpGame();
    expect(hook.result.current.seatPresence).toEqual({});

    const deadline = 1_000_000;
    act(() => ws.emit({ type: "OPPONENT_STATUS", connected: false, player: "p3", autoForfeitAt: deadline }));
    expect(hook.result.current.seatPresence).toEqual({ p3: { autoForfeitAt: deadline } });

    // reconnect → all-clear (no deadline) removes the entry.
    act(() => ws.emit({ type: "OPPONENT_STATUS", connected: true, player: "p3" }));
    expect(hook.result.current.seatPresence).toEqual({});
  });

  it("tracks multiple independent disconnected seats", () => {
    const { hook, ws } = bootMpGame();
    act(() => ws.emit({ type: "OPPONENT_STATUS", connected: false, player: "p2", autoForfeitAt: 111 }));
    act(() => ws.emit({ type: "OPPONENT_STATUS", connected: false, player: "p3", autoForfeitAt: 222 }));
    expect(hook.result.current.seatPresence).toEqual({ p2: { autoForfeitAt: 111 }, p3: { autoForfeitAt: 222 } });

    act(() => ws.emit({ type: "OPPONENT_STATUS", connected: true, player: "p2" }));
    expect(hook.result.current.seatPresence).toEqual({ p3: { autoForfeitAt: 222 } });
  });

  it("clears a seat's presence when the auto-forfeit fires (STATE shows it eliminated)", () => {
    const { hook, ws } = bootMpGame();
    act(() => ws.emit({ type: "OPPONENT_STATUS", connected: false, player: "p3", autoForfeitAt: 999 }));
    expect(hook.result.current.seatPresence.p3).toBeDefined();

    // The server injects FORFEIT; the resulting STATE shows p3 swept. No all-clear
    // is sent (the player is still gone) — the countdown must clear here anyway so
    // the elimination UI takes over cleanly.
    act(() => ws.emit(mpState({ defeated: ["p3"] })));
    expect(hook.result.current.seatPresence).toEqual({});
  });

  it("clears ALL presence when the game ends (winner set)", () => {
    const { hook, ws } = bootMpGame();
    act(() => ws.emit({ type: "OPPONENT_STATUS", connected: false, player: "p2", autoForfeitAt: 1 }));
    act(() => ws.emit({ type: "OPPONENT_STATUS", connected: false, player: "p3", autoForfeitAt: 2 }));
    act(() => ws.emit(mpState({ winner: "p1" })));
    expect(hook.result.current.seatPresence).toEqual({});
  });

  it("keeps a still-alive disconnected seat across other players' STATE broadcasts", () => {
    const { hook, ws } = bootMpGame();
    act(() => ws.emit({ type: "OPPONENT_STATUS", connected: false, player: "p3", autoForfeitAt: 500 }));
    // p1/p2 keep playing — normal STATE broadcasts arrive with p3 still alive.
    act(() => ws.emit(mpState()));
    expect(hook.result.current.seatPresence).toEqual({ p3: { autoForfeitAt: 500 } });
  });

  it("duel path unchanged: OPPONENT_STATUS without `player` drives only the coarse bool", () => {
    const hook = renderHook(() => useProSocket("ws://test"));
    const ws = FakeWebSocket.last!;
    act(() => ws.open());
    act(() => ws.emit(roomJoined()));
    act(() => ws.emit(minimalState()));

    act(() => ws.emit({ type: "OPPONENT_STATUS", connected: false }));
    expect(hook.result.current.opponentConnected).toBe(false);
    expect(hook.result.current.seatPresence).toEqual({}); // never populated in duel

    act(() => ws.emit({ type: "OPPONENT_STATUS", connected: true }));
    expect(hook.result.current.opponentConnected).toBe(true);
  });
});
