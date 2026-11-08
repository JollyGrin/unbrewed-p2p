import { act, renderHook } from "@testing-library/react";
import type { AccountState } from "../account/useAccount";
import { useProSocket } from "./useProSocket";
import { resetEngineVersions } from "./wireVersion";
import { PROTOCOL_VERSION } from "./protocol";

/**
 * #1550: the socket's storage side — a finished game retires its room keys,
 * stale keys are swept on load, and a full origin never breaks a handler.
 */
let mockAccount: AccountState = { status: "guest", account: null };
jest.mock("../account/useAccount", () => ({ useAccount: () => mockAccount }));
jest.mock("../account/useBadges", () => ({
  useBadges: () => ({ status: "ready", badges: [], selected: [], busy: false, notice: null }),
}));
jest.mock("../account/useCosmetics", () => ({ useCosmetics: () => ({ status: "ready", heroes: [] }) }));
const mockCapture = jest.fn();
jest.mock("../analytics", () => ({
  ...jest.requireActual("../analytics"),
  track: jest.fn(),
  captureException: (...a: unknown[]) => mockCapture(...a),
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
  sent: string[] = [];
  constructor(public url: string) {
    FakeWebSocket.last = this;
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }
  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }
  emit(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify({ v: PROTOCOL_VERSION, ...msg as object }) });
  }
}

const state = (winner: string | null = null) => ({
  type: "STATE",
  view: { you: "p1", prompt: null, activePlayer: "p1", winner, fighters: [] },
  legalActions: [],
});
const joined = (roomId = "R1") => ({ type: "ROOM_JOINED", roomId, token: "tok", you: "p1" });
const quota = () => Object.assign(new Error("full"), { name: "QuotaExceededError" });
const fillStorage = () =>
  jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw quota();
  });

const realWS = global.WebSocket;
beforeEach(() => {
  // @ts-expect-error — swap in the fake
  global.WebSocket = FakeWebSocket;
  localStorage.clear();
  sessionStorage.clear();
  resetEngineVersions();
  mockCapture.mockClear();
});
afterEach(() => {
  jest.restoreAllMocks();
  global.WebSocket = realWS;
  FakeWebSocket.last = null;
});

const boot = () => {
  const hook = renderHook(() => useProSocket("ws://test"));
  const ws = FakeWebSocket.last!;
  act(() => ws.open());
  return { hook, ws };
};

// First mount in this file: the sweep runs once per page load (module), so it
// must not follow another test that already mounted the hook.
describe("load sweep", () => {
  it("removes stale room keys once on mount, keeps indexed ones", () => {
    localStorage.setItem("unbrewed-pro-recent-rooms", JSON.stringify([{ roomId: "LIVE", ts: Date.now() }]));
    localStorage.setItem("unbrewed-pro-resume-LIVE", "b");
    localStorage.setItem("unbrewed-pro-token-LIVE", "t");
    localStorage.setItem("unbrewed-pro-resume-DONE", "b");
    localStorage.setItem("unbrewed-pro-bots-DONE", "{}");
    boot();
    expect(localStorage.getItem("unbrewed-pro-resume-LIVE")).toBe("b");
    expect(localStorage.getItem("unbrewed-pro-resume-DONE")).toBeNull();
    expect(localStorage.getItem("unbrewed-pro-bots-DONE")).toBeNull();
  });
});

describe("game over retires the room's browser-wide keys", () => {
  it("a winning STATE drops resume blob, token copy and bots; this tab keeps its seat and bots", () => {
    const { ws } = boot();
    act(() => ws.emit(joined()));
    act(() =>
      ws.emit({ type: "ROOM_STATUS", roomId: "R1", formatId: "duel", requiredPlayers: 2, seats: [{ player: "p1" }, { player: "p2", bot: "hard" }] }),
    );
    act(() => ws.emit(state()));
    act(() => ws.emit({ type: "RESUME_TOKEN", roomId: "R1", token: "blob" }));
    expect(localStorage.getItem("unbrewed-pro-resume-R1")).toBe("blob");

    act(() => ws.emit(state("p1")));
    expect(localStorage.getItem("unbrewed-pro-resume-R1")).toBeNull();
    expect(localStorage.getItem("unbrewed-pro-token-R1")).toBeNull();
    expect(localStorage.getItem("unbrewed-pro-bots-R1")).toBeNull();
    expect(sessionStorage.getItem("unbrewed-pro-token-R1")).toBe("tok");
    expect(JSON.parse(sessionStorage.getItem("unbrewed-pro-bots-R1")!)).toEqual({ p2: "hard" });

    // a blob trailing the winner does not bring the key back
    act(() => ws.emit({ type: "RESUME_TOKEN", roomId: "R1", token: "late" }));
    expect(localStorage.getItem("unbrewed-pro-resume-R1")).toBeNull();
  });

  it("Rematch still carries the finished room's bots into the new room", () => {
    const { hook, ws } = boot();
    act(() => ws.emit(joined()));
    act(() =>
      ws.emit({ type: "ROOM_STATUS", roomId: "R1", formatId: "duel", requiredPlayers: 2, seats: [{ player: "p1" }, { player: "p2", bot: "easy" }] }),
    );
    act(() => ws.emit(state("p1")));
    act(() => ws.emit({ type: "REMATCH_READY", roomId: "R2", token: "tok2" }));
    expect(hook.result.current.rematchOffer).toMatchObject({ phase: "ready", roomId: "R2" });
    expect(sessionStorage.getItem("unbrewed-pro-token-R2")).toBe("tok2");
    expect(JSON.parse(localStorage.getItem("unbrewed-pro-bots-R2")!)).toEqual({ p2: "easy" });
  });
});

describe("full storage never breaks a socket handler", () => {
  it("RESUME_TOKEN: no throw, the next message is still handled", () => {
    const { hook, ws } = boot();
    act(() => ws.emit(joined()));
    act(() => ws.emit(state()));
    fillStorage();
    expect(() => act(() => ws.emit({ type: "RESUME_TOKEN", roomId: "R1", token: "blob" }))).not.toThrow();
    act(() => ws.emit(state("p1")));
    expect(hook.result.current.snapshot?.view.winner).toBe("p1");
    expect(mockCapture).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ handled: true }));
  });

  it("ROOM_CREATED with bots still sets the room and its info", () => {
    const { hook, ws } = boot();
    act(() => hook.result.current.createRoom("hero", { difficulty: "hard" }));
    fillStorage();
    expect(() => act(() => ws.emit({ type: "ROOM_CREATED", roomId: "R9", token: "tok9", you: "p1" }))).not.toThrow();
    expect(hook.result.current.roomId).toBe("R9");
    expect(hook.result.current.roomInfo).toMatchObject({ you: "p1" });
  });

  it("REMATCH_READY still steps the rematch to ready", () => {
    const { hook, ws } = boot();
    act(() => ws.emit(joined()));
    act(() => ws.emit(state("p1")));
    fillStorage();
    expect(() => act(() => ws.emit({ type: "REMATCH_READY", roomId: "R2", token: "tok2" }))).not.toThrow();
    expect(hook.result.current.rematchOffer).toMatchObject({ phase: "ready", roomId: "R2" });
  });

  it("ROOM_STATUS still updates the roster", () => {
    const { hook, ws } = boot();
    act(() => ws.emit(joined()));
    fillStorage();
    act(() =>
      ws.emit({ type: "ROOM_STATUS", roomId: "R1", formatId: "duel", requiredPlayers: 2, seats: [{ player: "p1" }, { player: "p2", bot: "easy" }] }),
    );
    expect(hook.result.current.roomInfo?.roster).toHaveLength(2);
  });
});
