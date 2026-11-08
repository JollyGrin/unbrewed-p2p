/**
 * The lobby presence socket (#1542 ↔ engine #1034): HELLO on open, STATE on a
 * change, nothing at all while disabled, and a quiet give-up against an engine
 * that has no `/lobby` (its game socket answers HELLO with an ERROR).
 */
import { act, renderHook } from "@testing-library/react";
import { FakeWebSocket, installFakeWebSocket } from "@/scripts/renderFuzz/domEnv";
import { lobbySocketUrl, useLobbySocket } from "./useLobbySocket";

jest.mock("../account/useAccount", () => ({ useAccount: () => ({ status: "guest", account: null }) }));
jest.mock("../account/useBadges", () => ({ useBadges: () => ({ selected: [] }) }));

let SENT: Record<string, unknown>[] = [];

beforeAll(() => {
  installFakeWebSocket();
  FakeWebSocket.prototype.send = function send(data: string) {
    SENT.push(JSON.parse(data));
  } as unknown as FakeWebSocket["send"];
});

beforeEach(() => {
  FakeWebSocket.reset();
  SENT = [];
});

const open = async () => {
  // `latest()` is the newest GAME socket; every socket here is a lobby one.
  const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
  await act(async () => {
    ws.readyState = FakeWebSocket.OPEN;
    ws.onopen?.({});
  });
  return ws;
};
const deliver = (ws: FakeWebSocket, msg: Record<string, unknown>) =>
  act(async () => {
    ws.onmessage?.({ data: JSON.stringify({ v: 1, ...msg }) });
  });

const SNAP = { type: "SNAPSHOT", you: "me", here: 1, looking: 0, players: [], lobbies: [], tablesInPlay: 0 };

it("builds the URL beside the game socket's", () => {
  expect(lobbySocketUrl("ws://localhost:8787")).toBe("ws://localhost:8787/lobby");
  expect(lobbySocketUrl("wss://engine.unbrewed.xyz/")).toBe("wss://engine.unbrewed.xyz/lobby");
});

it("opens nothing while disabled", () => {
  renderHook(() => useLobbySocket({ wsUrl: "ws://x", enabled: false, state: "picking" }));
  expect(FakeWebSocket.instances).toHaveLength(0);
});

it("says HELLO (a guest sends no identity), then STATE when the hero changes", async () => {
  const { result, rerender } = renderHook((p: { heroId: string | null }) =>
    useLobbySocket({ wsUrl: "ws://x", enabled: true, state: "picking", heroId: p.heroId }), { initialProps: { heroId: null as string | null } });
  const ws = await open();
  expect(ws.url).toBe("ws://x/lobby");
  expect(SENT).toEqual([{ v: 1, type: "HELLO", state: "picking" }]);
  await deliver(ws, SNAP);
  expect(result.current.snapshot?.here).toBe(1);
  rerender({ heroId: "king-kong" });
  expect(SENT.at(-1)).toEqual({ v: 1, type: "STATE", state: "picking", heroId: "king-kong" });
});

it("closes and drops the snapshot when disabled", async () => {
  const { result, rerender } = renderHook((p: { enabled: boolean }) =>
    useLobbySocket({ wsUrl: "ws://x", enabled: p.enabled, state: "picking" }), { initialProps: { enabled: true } });
  const ws = await open();
  await deliver(ws, SNAP);
  rerender({ enabled: false });
  expect(ws.readyState).toBe(FakeWebSocket.CLOSED);
  expect(result.current.snapshot).toBeNull();
});

it("gives up for the page load when the engine has no /lobby", async () => {
  jest.useFakeTimers();
  try {
    const { result } = renderHook(() => useLobbySocket({ wsUrl: "ws://x", enabled: true, state: "picking" }));
    const ws = await open();
    // An engine without the route hands the upgrade to its game socket.
    await deliver(ws, { v: 39, type: "ERROR", code: "VERSION", message: "unsupported protocol version" });
    await act(async () => {
      ws.onclose?.({});
      jest.advanceTimersByTime(60_000);
    });
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(result.current.snapshot).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});

it("hands NUDGED to the page", async () => {
  const onNudged = jest.fn();
  renderHook(() => useLobbySocket({ wsUrl: "ws://x", enabled: true, state: "picking", onNudged }));
  const ws = await open();
  await deliver(ws, SNAP);
  await deliver(ws, { type: "NUDGED", from: { id: "sam", state: "picking", sinceMs: 1, displayName: "Sam" } });
  expect(onNudged).toHaveBeenCalledWith(expect.objectContaining({ id: "sam", displayName: "Sam" }));
});
