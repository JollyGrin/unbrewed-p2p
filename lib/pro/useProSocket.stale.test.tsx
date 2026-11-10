import { act, render, renderHook, screen } from "@testing-library/react";
import { useProSocket } from "./useProSocket";
import { PROTOCOL_VERSION } from "./protocol";
import { RELOAD_GUARD_KEY, reloadPage, resetClientStale } from "./staleClient";
import { useProLiveRosterState } from "./useProLiveRoster";
import { StaleClientBanner } from "@/components/Pro/StaleClientBanner";

// Stale client (p2p #1549). Same stubs as useProSocket.test.tsx: no test may
// reach `/me`, `/me/badges` or `/me/cosmetics`.
jest.mock("../account/useAccount", () => ({ useAccount: () => ({ status: "guest", account: null }) }));
jest.mock("../account/useBadges", () => ({
  useBadges: () => ({ status: "ready", badges: [], selected: [], busy: false, notice: null }),
}));
jest.mock("../account/useCosmetics", () => ({ useCosmetics: () => ({ status: "ready", heroes: [] }) }));

const mockTrack = jest.fn((_event: string, _props?: Record<string, unknown>, _opts?: unknown) => true);
jest.mock("../analytics", () => ({
  ...jest.requireActual("../analytics"),
  track: (event: string, props?: Record<string, unknown>, opts?: unknown) => mockTrack(event, props, opts),
}));

// The rollback re-bind only fires for a bind above PROTOCOL_VERSION, which the
// real wireVersionFor never produces any more; a test can ask for one.
let mockWireV: number | null = null;
jest.mock("./wireVersion", () => {
  const actual = jest.requireActual("./wireVersion");
  return {
    ...actual,
    wireVersionFor: (url: string) => mockWireV ?? actual.wireVersionFor(url),
  };
});

class FakeWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;
  static all: FakeWebSocket[] = [];
  static get last() {
    return FakeWebSocket.all[FakeWebSocket.all.length - 1] ?? null;
  }
  readyState = FakeWebSocket.CONNECTING;
  sent: Record<string, unknown>[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e?: unknown) => void) | null = null;
  constructor(public url: string) {
    FakeWebSocket.all.push(this);
  }
  send(raw: string) {
    this.sent.push(JSON.parse(raw));
  }
  close() {
    this.readyState = FakeWebSocket.CLOSED;
  }
  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }
  emit(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
  drop(code = 1006) {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code, reason: "" });
  }
}

// The engine stamps every frame, ERROR included, with its own version.
const versionError = (engineV: number) => ({
  v: engineV,
  type: "ERROR",
  code: "VERSION",
  message: `Protocol v${engineV} required (got v${PROTOCOL_VERSION}) — refresh the page`,
});
const VERSION_ERROR = versionError(PROTOCOL_VERSION + 1); // an engine newer than this bundle
const OLDER_ENGINE_ERROR = versionError(PROTOCOL_VERSION - 1); // this bundle is the newer one
const staleEvents = () => mockTrack.mock.calls.filter(([event]) => event === "client_version_stale");

describe("stale client (p2p #1549)", () => {
  const realWS = global.WebSocket;
  let reload: jest.SpyInstance;
  beforeEach(() => {
    jest.useFakeTimers();
    // @ts-expect-error — swap in the fake for the test
    global.WebSocket = FakeWebSocket;
    FakeWebSocket.all = [];
    window.localStorage.clear();
    window.sessionStorage.clear();
    mockTrack.mockReset().mockImplementation(() => true);
    mockWireV = null;
    resetClientStale();
    reload = jest.spyOn(reloadPage, "run").mockImplementation(() => {});
  });
  afterEach(() => {
    global.WebSocket = realWS;
    reload.mockRestore();
    jest.useRealTimers();
  });

  it("VERSION on the picker: stale, banner, one event, no further sends, no reconnect", () => {
    const { result } = renderHook(() => useProSocket("ws://test"));
    const ws = FakeWebSocket.last!;
    act(() => ws.open());
    expect(ws.sent.map((m) => m.type)).toEqual(["LIST_HEROES"]);
    act(() => ws.emit(VERSION_ERROR));

    expect(result.current.stale).toBe(true);
    render(<StaleClientBanner />);
    expect(screen.getByText(/The game updated — refresh the page/)).toBeTruthy();
    expect(staleEvents()).toEqual([
      ["client_version_stale", { client_version: PROTOCOL_VERSION, message_type: "LIST_HEROES" }, { beacon: true }],
    ]);

    // The socket is closed, and the lobby poll, a join and its close event go nowhere.
    expect(ws.readyState).toBe(FakeWebSocket.CLOSED);
    act(() => result.current.requestLobbies());
    act(() => result.current.joinRoom("ROOM1", "alice"));
    act(() => ws.drop());
    act(() => {
      jest.advanceTimersByTime(120_000);
    });
    expect(ws.sent.map((m) => m.type)).toEqual(["LIST_HEROES"]);
    expect(FakeWebSocket.all).toHaveLength(1);
    // A tab return doesn't reopen it either.
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(FakeWebSocket.all).toHaveLength(1);
  });

  it("with no seat and no game, reloads once; the guard holds for 10 minutes", () => {
    renderHook(() => useProSocket("ws://test"));
    act(() => FakeWebSocket.last!.open());
    act(() => FakeWebSocket.last!.emit(VERSION_ERROR));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(Number(window.sessionStorage.getItem(RELOAD_GUARD_KEY))).toBeGreaterThan(0);

    // The "reloaded" page is still served the old bundle (a stale Pages cache).
    resetClientStale();
    renderHook(() => useProSocket("ws://test"));
    act(() => FakeWebSocket.last!.open());
    act(() => FakeWebSocket.last!.emit(VERSION_ERROR));
    expect(reload).toHaveBeenCalledTimes(1);

    // Ten minutes on, another try is allowed.
    jest.setSystemTime(Date.now() + 10 * 60 * 1000 + 1);
    resetClientStale();
    renderHook(() => useProSocket("ws://test"));
    act(() => FakeWebSocket.last!.open());
    act(() => FakeWebSocket.last!.emit(VERSION_ERROR));
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("in a game: banner, but never an auto-reload", () => {
    const { result } = renderHook(() => useProSocket("ws://test"));
    act(() => FakeWebSocket.last!.open());
    act(() => result.current.joinRoom("ROOM1", "alice"));
    act(() =>
      FakeWebSocket.last!.emit({ type: "ROOM_JOINED", roomId: "ROOM1", you: "p2", token: "tok" })
    );
    act(() => FakeWebSocket.last!.emit(VERSION_ERROR));
    expect(result.current.stale).toBe(true);
    expect(reload).not.toHaveBeenCalled();
  });

  it("a hidden tab waits until it is visible to reload", () => {
    const vis = jest.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    renderHook(() => useProSocket("ws://test"));
    act(() => FakeWebSocket.last!.open());
    act(() => FakeWebSocket.last!.emit(VERSION_ERROR));
    expect(reload).not.toHaveBeenCalled();
    vis.mockReturnValue("visible");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(reload).toHaveBeenCalledTimes(1);
    vis.mockRestore();
  });

  it("an engine OLDER than this bundle refuses it: no banner, no reload, the socket keeps going and reconnects", () => {
    const { result } = renderHook(() => useProSocket("ws://test"));
    const ws = FakeWebSocket.last!;
    act(() => ws.open());
    act(() => ws.emit(OLDER_ENGINE_ERROR));

    expect(result.current.stale).toBe(false);
    render(<StaleClientBanner />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(staleEvents()).toHaveLength(0);
    expect(reload).not.toHaveBeenCalled();
    expect(ws.readyState).toBe(FakeWebSocket.OPEN);
    act(() => result.current.requestLobbies());
    expect(ws.sent.map((m) => m.type)).toEqual(["LIST_HEROES", "LIST_LOBBIES"]);

    // A drop reconnects as it always has, and the new socket asks again.
    act(() => ws.drop());
    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(FakeWebSocket.all).toHaveLength(2);
    act(() => FakeWebSocket.last!.open());
    expect(FakeWebSocket.last!.sent.map((m) => m.type)).toEqual(["LIST_HEROES"]);
  });

  it("unmounting a hidden stale tab drops its pending reload-on-visible listener", () => {
    const vis = jest.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    const { unmount } = renderHook(() => useProSocket("ws://test"));
    act(() => FakeWebSocket.last!.open());
    act(() => FakeWebSocket.last!.emit(VERSION_ERROR));
    unmount();
    vis.mockReturnValue("visible");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(reload).not.toHaveBeenCalled();
    vis.mockRestore();
  });

  it("a rematch frame refused by a NEWER engine stays a rematch refusal, not stale", () => {
    const { result } = renderHook(() => useProSocket("ws://test"));
    const ws = FakeWebSocket.last!;
    act(() => ws.open());
    act(() => result.current.joinRoom("ROOM1", "alice"));
    act(() => ws.emit({ type: "ROOM_JOINED", roomId: "ROOM1", you: "p2", token: "tok" }));
    act(() => result.current.offerRematch());
    expect(ws.sent.at(-1)).toMatchObject({ type: "REMATCH_OFFER" });
    act(() => ws.emit(VERSION_ERROR));
    expect(result.current.rematchOffer.phase).not.toBe("offering");
    expect(result.current.stale).toBe(false);
    expect(staleEvents()).toHaveLength(0);
    expect(ws.readyState).toBe(FakeWebSocket.OPEN);
  });

  it("the rollback re-bind is unchanged: re-sent at PROTOCOL_VERSION, not stale", () => {
    mockWireV = PROTOCOL_VERSION + 1;
    const { result } = renderHook(() => useProSocket("ws://test"));
    const ws = FakeWebSocket.last!;
    act(() => ws.open());
    act(() => result.current.joinRoom("ROOM1", "alice"));
    expect(ws.sent.at(-1)).toMatchObject({ type: "JOIN_ROOM", v: PROTOCOL_VERSION + 1 });
    act(() => ws.emit(VERSION_ERROR));
    expect(ws.sent.at(-1)).toMatchObject({ type: "JOIN_ROOM", v: PROTOCOL_VERSION });
    expect(result.current.stale).toBe(false);
    expect(staleEvents()).toHaveLength(0);
    expect(reload).not.toHaveBeenCalled();
  });

  it("the /pro roster fetch flags the page stale too, and later mounts don't ask again", () => {
    renderHook(() => useProLiveRosterState("ws://test"));
    act(() => FakeWebSocket.last!.open());
    act(() => FakeWebSocket.last!.emit(VERSION_ERROR));
    render(<StaleClientBanner />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(reload).toHaveBeenCalledTimes(1);

    const { result } = renderHook(() => useProLiveRosterState("ws://test"));
    expect(FakeWebSocket.all).toHaveLength(1);
    expect(result.current.offline).toBe(true);
  });

  it("the roster fetch refused by an OLDER engine is not stale", () => {
    renderHook(() => useProLiveRosterState("ws://test"));
    act(() => FakeWebSocket.last!.open());
    act(() => FakeWebSocket.last!.emit(OLDER_ENGINE_ERROR));
    render(<StaleClientBanner />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(reload).not.toHaveBeenCalled();
    expect(staleEvents()).toHaveLength(0);
  });

  it("the roster fetch with autoReload off shows the banner but doesn't reload", () => {
    renderHook(() => useProLiveRosterState("ws://test", false, false));
    act(() => FakeWebSocket.last!.open());
    act(() => FakeWebSocket.last!.emit(VERSION_ERROR));
    expect(reload).not.toHaveBeenCalled();
  });
});
