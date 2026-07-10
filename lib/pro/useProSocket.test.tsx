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

  url: string;
  readyState = FakeWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.last = this;
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
