// THROWAWAY review harness for PR #865 — not part of the PR. Deleted after review.
import { act, renderHook } from "@testing-library/react";
import type { AccountState } from "../account/useAccount";
import type { HeroCosmetics } from "../account/cosmetics";
import { RESUME_DEADLINE_MS, RESYNC_COOLDOWN_MS, useProSocket } from "./useProSocket";

let mockAccount: AccountState = { status: "guest", account: null };
jest.mock("../account/useAccount", () => ({ useAccount: () => mockAccount }));
let mockBadge: string[] = [];
jest.mock("../account/useBadges", () => ({
  useBadges: () => ({ status: "ready", badges: [], selected: mockBadge, busy: false, notice: null }),
}));
let mockCosmetics: HeroCosmetics[] = [];
jest.mock("../account/useCosmetics", () => ({ useCosmetics: () => ({ status: "ready", heroes: mockCosmetics }) }));

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

const minimalState = (extra: Record<string, unknown> = {}, events?: unknown[]) => ({
  type: "STATE",
  view: { you: "p1", prompt: null, activePlayer: "p1", fighters: [], ...extra },
  legalActions: [],
  ...(events ? { events } : {}),
});
const roomJoined = () => ({ type: "ROOM_JOINED", roomId: "R1", token: "tok", you: "p1" });
const reconnects = (ws: FakeWebSocket) => ws.sentTypes.filter((t) => t === "RECONNECT").length;

describe("PR #865 review harness", () => {
  const realWS = global.WebSocket;
  let hiddenFlag = false;
  beforeAll(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hiddenFlag });
  });
  beforeEach(() => {
    // @ts-expect-error — fake
    global.WebSocket = FakeWebSocket;
    window.localStorage.clear();
    window.sessionStorage.clear();
    hiddenFlag = false;
  });
  afterEach(() => {
    global.WebSocket = realWS;
    FakeWebSocket.last = null;
    jest.useRealTimers();
  });

  const backgroundThenReturn = () => {
    hiddenFlag = true;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    hiddenFlag = false;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
  };
  const boot = (slowMode = false, stateExtra: Record<string, unknown> = {}) => {
    const hook = renderHook(() => useProSocket("ws://test", false, slowMode));
    const ws = FakeWebSocket.last!;
    act(() => ws.open());
    act(() => ws.emit(roomJoined()));
    act(() => ws.emit(minimalState(stateExtra)));
    return { hook, ws };
  };

  it("H1 undo prompt: a tab return's RECONNECT answer wipes a pending incoming undo request", () => {
    const { hook, ws } = boot();
    act(() => ws.emit({ type: "UNDO_REQUESTED", requester: "p2", rewindActions: [] }));
    expect(hook.result.current.incomingUndo).not.toBeNull();
    backgroundThenReturn();
    expect(reconnects(ws)).toBe(1);
    // server answers RECONNECT: ROOM_JOINED + STATE (it never re-pushes UNDO_REQUESTED)
    act(() => ws.emit(roomJoined()));
    act(() => ws.emit(minimalState()));
    expect(hook.result.current.incomingUndo).toBeNull(); // dialog closed; server still has pendingUndo
  });

  it("H1b requester side: undoPending cleared by the resync STATE though the request is still pending", () => {
    const { hook, ws } = boot();
    act(() => hook.result.current.requestUndo());
    expect(hook.result.current.undoPending).toBe(true);
    backgroundThenReturn();
    act(() => ws.emit(roomJoined()));
    act(() => ws.emit(minimalState()));
    expect(hook.result.current.undoPending).toBe(false);
  });

  it("H2 desktop: a bare window focus (document never hidden) fires RECONNECT + resyncing", () => {
    const { hook, ws } = boot();
    act(() => window.dispatchEvent(new Event("focus")));
    expect(reconnects(ws)).toBe(1);
    expect(hook.result.current.resyncing).toBe(true);
  });

  it("H3 pageshow with persisted=false (every normal load) also fires RECONNECT", () => {
    const { ws } = boot();
    const ev = new Event("pageshow") as Event & { persisted?: boolean };
    Object.defineProperty(ev, "persisted", { value: false });
    act(() => window.dispatchEvent(ev));
    expect(reconnects(ws)).toBe(1);
  });

  it("H4 silently-dead socket: no answer to the verification RECONNECT never triggers a reconnect", () => {
    jest.useFakeTimers();
    const { hook, ws } = boot();
    const before = FakeWebSocket.instances;
    backgroundThenReturn();
    expect(reconnects(ws)).toBe(1);
    act(() => jest.advanceTimersByTime(5 * 60_000)); // 5 minutes, nothing comes back
    expect(FakeWebSocket.instances).toBe(before); // no new socket ever
    expect(hook.result.current.status).toBe("open"); // still "Connected"
    expect(hook.result.current.resyncing).toBe(true); // "Board out of date — refreshing…" spinner forever
  });

  it("H5 post-game: return after room reaped, no resume blob → gameLost + resyncing stuck", () => {
    const { hook, ws } = boot(false, { winner: "p1" });
    backgroundThenReturn();
    expect(reconnects(ws)).toBe(1);
    act(() => ws.emit({ type: "ERROR", code: "ROOM_NOT_FOUND", message: "No room R1" }));
    expect(hook.result.current.gameLost).toBe(true);
    expect(hook.result.current.resyncing).toBe(true);
  });

  it("H5b post-game with blob: ROOM_NOT_FOUND → RESUME_ROOM (resurrects finished room); RESUME_FAILED → gameLost", () => {
    const { hook, ws } = boot(false, { winner: "p1" });
    act(() => ws.emit({ type: "RESUME_TOKEN", roomId: "R1", token: "blob" }));
    backgroundThenReturn();
    act(() => ws.emit({ type: "ERROR", code: "ROOM_NOT_FOUND", message: "No room R1" }));
    expect(ws.sentTypes).toContain("RESUME_ROOM");
    act(() => ws.emit({ type: "ERROR", code: "RESUME_FAILED", message: "in use by another game" }));
    expect(hook.result.current.gameLost).toBe(true);
    expect(hook.result.current.resyncing).toBe(true);
  });

  it("H6 slow mode: a tab return's resync STATE flushes the held spotlight + queue", () => {
    const { hook, ws } = boot(true);
    const opp = (n: number) => minimalState({ activePlayer: "p2", n }, [{ type: "ACTION_SPENT", player: "p2" }]);
    act(() => ws.emit(opp(1)));
    act(() => ws.emit(opp(2)));
    expect(hook.result.current.slowModeHeld).not.toBeNull();
    expect(hook.result.current.slowModePending).toBe(1);
    backgroundThenReturn();
    act(() => ws.emit(roomJoined()));
    act(() => ws.emit(minimalState()));
    expect(hook.result.current.slowModeHeld).toBeNull();
    expect(hook.result.current.slowModePending).toBe(0);
  });

  it("H7 resumingRef survives a socket close: an interrupted RESUME_ROOM makes the next BAD_TOKEN terminal", () => {
    jest.useFakeTimers();
    const { hook, ws } = boot();
    act(() => ws.emit({ type: "RESUME_TOKEN", roomId: "R1", token: "blob" }));
    act(() => ws.emit({ type: "ERROR", code: "ROOM_NOT_FOUND", message: "gone" }));
    expect(ws.sentTypes).toContain("RESUME_ROOM"); // resumingRef = true
    act(() => ws.close()); // phone locked, socket dies before the answer
    backgroundThenReturn(); // resume path reconnects immediately
    const next = FakeWebSocket.last!;
    expect(next).not.toBe(ws);
    act(() => next.open());
    expect(next.sentTypes).toContain("RECONNECT");
    // the room WAS revived (fresh tokens) → our old token is BAD_TOKEN
    act(() => next.emit({ type: "ERROR", code: "BAD_TOKEN", message: "Reconnect token not recognized" }));
    expect(next.sentTypes).not.toContain("RESUME_ROOM"); // never retries the resume
    expect(hook.result.current.gameLost).toBe(true);
  });

  it("H8 repeated focus returns postpone the SERVER_RESTARTING loss deadline indefinitely", () => {
    jest.useFakeTimers();
    const { hook, ws } = boot();
    act(() => ws.emit({ type: "SERVER_RESTARTING" }));
    act(() => ws.close());
    for (let i = 0; i < 6; i++) {
      act(() => jest.advanceTimersByTime(RESUME_DEADLINE_MS - 5000));
      // every reconnect attempt fails
      if (FakeWebSocket.last!.readyState !== FakeWebSocket.CLOSED) act(() => FakeWebSocket.last!.close());
      act(() => window.dispatchEvent(new Event("focus")));
    }
    // 6 × 40s = 240s after SERVER_RESTARTING with no STATE — contract says lost after 45s
    expect(hook.result.current.gameLost).toBe(false);
  });

  it("H9 RESUME_TOO_LARGE (sent after every broadcast/RECONNECT for oversized games) trips gameLost", () => {
    const { hook, ws } = boot();
    act(() => ws.emit({ type: "ERROR", code: "RESUME_TOO_LARGE", message: "too long" }));
    expect(hook.result.current.gameLost).toBe(true);
  });

  it("H11 click-to-focus: the RECONNECT's STATE clears the #840 in-flight guard for an ACTION sent after it", () => {
    const { hook, ws } = boot();
    const action = { type: "END_TURN", player: "p1" } as never;
    act(() => window.dispatchEvent(new Event("focus"))); // window focus lands first (mousedown)
    let first = false;
    act(() => {
      first = hook.result.current.sendAction(action); // the click's action
    });
    expect(first).toBe(true);
    // server answers the RECONNECT (sent first) before the ACTION
    act(() => ws.emit(roomJoined()));
    act(() => ws.emit(minimalState()));
    let second = false;
    act(() => {
      second = hook.result.current.sendAction(action); // thumb-bounce / double-click
    });
    expect(second).toBe(true); // guard defeated → duplicate ACTION → ILLEGAL_ACTION
    expect(ws.sentTypes.filter((t) => t === "ACTION")).toHaveLength(2);
  });

  it("H12 an ERROR answer to the verification RECONNECT latches resyncing and resumeExpected", () => {
    const { hook, ws } = boot(true);
    backgroundThenReturn();
    act(() => ws.emit({ type: "ERROR", code: "RATE_LIMITED", message: "slow down" }));
    expect(hook.result.current.resyncing).toBe(true); // spinner stays up
    // next opponent batch is treated as the resume view → skips the slow-mode spotlight
    act(() => ws.emit(minimalState({ activePlayer: "p2" }, [{ type: "ACTION_SPENT", player: "p2" }])));
    expect(hook.result.current.slowModeHeld).toBeNull();
  });

  it("H10 the verification RECONNECT during a pending SERVER_RESTARTING: its ROOM_JOINED cancels the loss deadline", () => {
    jest.useFakeTimers();
    const { hook, ws } = boot();
    act(() => jest.advanceTimersByTime(RESYNC_COOLDOWN_MS));
    act(() => ws.emit({ type: "SERVER_RESTARTING" }));
    backgroundThenReturn(); // socket still reports OPEN
    expect(reconnects(ws)).toBe(1);
  });
});
