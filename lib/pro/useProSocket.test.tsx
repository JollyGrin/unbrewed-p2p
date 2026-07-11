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
