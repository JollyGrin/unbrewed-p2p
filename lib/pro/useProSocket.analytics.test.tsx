import { act, renderHook } from "@testing-library/react";
import { SEAT_REPLACED_CLOSE_CODE, useProSocket } from "./useProSocket";
import { resetOncePerPageLoad } from "../analyticsErrors";

// ws failure events (issue #1514). Same stubs as useProSocket.test.tsx: no
// test may reach `/me`, `/me/badges` or `/me/cosmetics`.
jest.mock("../account/useAccount", () => ({ useAccount: () => ({ status: "guest", account: null }) }));
jest.mock("../account/useBadges", () => ({
  useBadges: () => ({ status: "ready", badges: [], selected: [], busy: false, notice: null }),
}));
jest.mock("../account/useCosmetics", () => ({ useCosmetics: () => ({ status: "ready", heroes: [] }) }));

const mockTrack = jest.fn((_event: string, _props?: Record<string, unknown>) => true);
jest.mock("../analytics", () => ({
  ...jest.requireActual("../analytics"),
  track: (event: string, props?: Record<string, unknown>) => mockTrack(event, props),
}));

class FakeWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;
  static last: FakeWebSocket | null = null;
  readyState = FakeWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e?: unknown) => void) | null = null;
  constructor(public url: string) {
    FakeWebSocket.last = this;
  }
  send() {}
  close() {
    this.readyState = FakeWebSocket.CLOSED;
  }
  // --- test drivers ---
  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }
  emit(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
  drop(code?: number) {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.(code === undefined ? undefined : { code, reason: "" });
  }
}

const events = (name: string) => mockTrack.mock.calls.filter(([event]) => event === name);

describe("useProSocket — ws failure analytics (issue #1514)", () => {
  const realWS = global.WebSocket;
  beforeEach(() => {
    jest.useFakeTimers();
    // @ts-expect-error — swap in the fake for the test
    global.WebSocket = FakeWebSocket;
    window.localStorage.clear();
    mockTrack.mockReset().mockImplementation(() => true);
    resetOncePerPageLoad();
  });
  afterEach(() => {
    global.WebSocket = realWS;
    FakeWebSocket.last = null;
    jest.useRealTimers();
  });

  /** Let the jittered backoff timer open the next socket. */
  const nextSocket = () => {
    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    return FakeWebSocket.last!;
  };

  it("a socket that never opens reports ws_connect_failed once, however many retries fail", () => {
    renderHook(() => useProSocket("ws://test"));
    act(() => FakeWebSocket.last!.drop(1006));
    for (let i = 0; i < 3; i++) act(() => nextSocket().drop(1006));

    expect(events("ws_connect_failed")).toEqual([["ws_connect_failed", { mode: "pro" }]]);
    expect(events("ws_closed_unexpected")).toHaveLength(0);
  });

  it("an abnormal close of an open socket reports ws_closed_unexpected once, with its code", () => {
    renderHook(() => useProSocket("ws://test"));
    act(() => FakeWebSocket.last!.open());
    act(() => FakeWebSocket.last!.drop(1006));
    for (let i = 0; i < 3; i++) {
      const ws = nextSocket();
      act(() => ws.open());
      act(() => ws.drop(1011));
    }

    expect(events("ws_closed_unexpected")).toEqual([["ws_closed_unexpected", { mode: "pro", code: 1006 }]]);
    expect(events("ws_connect_failed")).toHaveLength(0);
  });

  it.each([1000, 1001, 1012])("close code %i is planned, not unexpected", (code) => {
    renderHook(() => useProSocket("ws://test"));
    act(() => FakeWebSocket.last!.open());
    act(() => FakeWebSocket.last!.drop(code));
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it("a close after SERVER_RESTARTING (and the reconnect failures while it boots) reports nothing", () => {
    renderHook(() => useProSocket("ws://test"));
    act(() => FakeWebSocket.last!.open());
    act(() => FakeWebSocket.last!.emit({ type: "SERVER_RESTARTING" }));
    act(() => FakeWebSocket.last!.drop(1006));
    act(() => nextSocket().drop(1006));
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it("the restart window ends at the next open: a later drop is reported", () => {
    renderHook(() => useProSocket("ws://test"));
    act(() => FakeWebSocket.last!.open());
    act(() => FakeWebSocket.last!.emit({ type: "SERVER_RESTARTING" })); // before any STATE
    act(() => FakeWebSocket.last!.drop(1006));
    const ws = nextSocket();
    act(() => ws.open()); // the new instance is up
    act(() => ws.drop(1006));
    expect(events("ws_closed_unexpected")).toEqual([["ws_closed_unexpected", { mode: "pro", code: 1006 }]]);
  });

  it("a seat taken over by another tab reports nothing", () => {
    renderHook(() => useProSocket("ws://test"));
    act(() => FakeWebSocket.last!.open());
    act(() => FakeWebSocket.last!.drop(SEAT_REPLACED_CLOSE_CODE));
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it("unmounting (a deliberate leave) reports nothing", () => {
    const hook = renderHook(() => useProSocket("ws://test"));
    act(() => FakeWebSocket.last!.open());
    const ws = FakeWebSocket.last!;
    hook.unmount();
    act(() => ws.drop(1006)); // the browser's close event after our close()
    expect(mockTrack).not.toHaveBeenCalled();
  });
});
