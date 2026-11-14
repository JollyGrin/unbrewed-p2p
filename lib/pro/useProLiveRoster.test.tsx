import { act, renderHook } from "@testing-library/react";
import { PROTOCOL_VERSION } from "./protocol";
import { resetClientStale } from "./staleClient";
import { useProLiveRosterState } from "./useProLiveRoster";

/**
 * The one-shot roster socket, and the /pro launcher's `withLobbies` option
 * (unbrewed-p2p-1626): LIST_LOBBIES rides the same socket, which closes once
 * both replies are in, or a short grace after HEROES.
 */
class FakeWebSocket {
  static all: FakeWebSocket[] = [];
  static get last() {
    return FakeWebSocket.all[FakeWebSocket.all.length - 1];
  }
  sent: Record<string, unknown>[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(public url: string) {
    FakeWebSocket.all.push(this);
  }
  send(raw: string) {
    this.sent.push(JSON.parse(raw));
  }
  close() {
    this.closed = true;
  }
  open() {
    this.onopen?.();
  }
  emit(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

const HEROES = { v: PROTOCOL_VERSION, type: "HEROES", heroes: [{ heroId: "batman", name: "Batman", hp: 16, move: 2, reach: "MELEE", tier: "community" }] };
const LOBBIES = { v: PROTOCOL_VERSION, type: "LOBBIES", lobbies: [{ roomId: "r1", heroId: "batman", heroName: "Batman", ageMs: 1000 }] };

const realWebSocket = global.WebSocket;
beforeEach(() => {
  FakeWebSocket.all = [];
  resetClientStale();
  (global as unknown as { WebSocket: unknown }).WebSocket = FakeWebSocket;
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
  (global as unknown as { WebSocket: unknown }).WebSocket = realWebSocket;
});

describe("useProLiveRosterState", () => {
  it("asks only for heroes by default, and closes on the reply", () => {
    const { result } = renderHook(() => useProLiveRosterState("ws://test"));
    act(() => FakeWebSocket.last.open());
    expect(FakeWebSocket.last.sent.map((m) => m.type)).toEqual(["LIST_HEROES"]);
    act(() => FakeWebSocket.last.emit(HEROES));
    expect(result.current.heroes).toHaveLength(1);
    expect(result.current.lobbies).toBeUndefined();
    expect(FakeWebSocket.last.closed).toBe(true);
  });

  it("with lobbies, sends both requests and holds the socket until both replies land", () => {
    const { result } = renderHook(() => useProLiveRosterState("ws://test", false, true, true));
    act(() => FakeWebSocket.last.open());
    expect(FakeWebSocket.last.sent.map((m) => m.type)).toEqual(["LIST_HEROES", "LIST_LOBBIES"]);
    act(() => FakeWebSocket.last.emit(HEROES));
    expect(FakeWebSocket.last.closed).toBe(false);
    act(() => FakeWebSocket.last.emit(LOBBIES));
    expect(result.current.heroes).toHaveLength(1);
    expect(result.current.lobbies).toHaveLength(1);
    expect(FakeWebSocket.last.closed).toBe(true);
  });

  it("with lobbies, a missing LOBBIES reply never holds the socket open", () => {
    const { result } = renderHook(() => useProLiveRosterState("ws://test", false, true, true));
    act(() => FakeWebSocket.last.open());
    act(() => FakeWebSocket.last.emit(HEROES));
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(FakeWebSocket.last.closed).toBe(true);
    expect(result.current.heroes).toHaveLength(1);
    expect(result.current.offline).toBe(false);
  });
});
