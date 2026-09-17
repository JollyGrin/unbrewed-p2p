import { act, renderHook } from "@testing-library/react";
import type { AccountState } from "../account/useAccount";
import type { HeroCosmetics } from "../account/cosmetics";
import { decodeCosmetics, wireCardRim } from "./cosmeticsWire";
import {
  ACTION_IN_FLIGHT_MS,
  ILLEGAL_ACTION_RESYNC_AFTER,
  RESUME_DEADLINE_MS,
  RESYNC_COOLDOWN_MS,
  useProSocket,
} from "./useProSocket";

// The hook reads the optional Discord account (issue #568) to decide whether to
// claim a seat identity. Stubbed here so no test hits `/me`; the default is a
// guest, which is exactly the state every pre-#568 test assumes.
let mockAccount: AccountState = { status: "guest", account: null };
jest.mock("../account/useAccount", () => ({
  useAccount: () => mockAccount,
}));

// The badge case (issue #577) is the second thing the hook reads. Stubbed for
// the same reason: no test should reach `/me/badges`, and "wearing nothing" is
// what every pre-#577 test assumes.
let mockBadge: string[] = [];
jest.mock("../account/useBadges", () => ({
  useBadges: () => ({
    status: "ready",
    badges: [],
    selected: mockBadge,
    busy: false,
    notice: null,
  }),
}));

// The cosmetic standing (#614's hook) is the third thing the socket reads, for
// the loadout it publishes on join (#615). Stubbed for the same reason again:
// no test should reach `/me/cosmetics`, and "nothing equipped" is what every
// pre-#615 test assumes. Only `heroes` is read here — the spend/toggle half of
// that hook belongs to /collection.
let mockCosmetics: HeroCosmetics[] = [];
jest.mock("../account/useCosmetics", () => ({
  useCosmetics: () => ({ status: "ready", heroes: mockCosmetics }),
}));

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
    act(() => ws.emit({ type: "ERROR", code: "NOT_YOUR_SEAT", message: "nope" }));

    expect(hook.result.current.serverError).toBe(false);
    expect(hook.result.current.error).toEqual({ code: "NOT_YOUR_SEAT", message: "nope" });
  });
});

describe("useProSocket — double-tap in flight + ILLEGAL_ACTION resilience (p2p #840)", () => {
  const realWS = global.WebSocket;
  beforeEach(() => {
    // @ts-expect-error — swap in the fake for the test
    global.WebSocket = FakeWebSocket;
    window.localStorage.clear();
  });
  afterEach(() => {
    global.WebSocket = realWS;
    FakeWebSocket.last = null;
    jest.useRealTimers();
  });

  const bootIntoGame = () => {
    const hook = renderHook(() => useProSocket("ws://test"));
    const ws = FakeWebSocket.last!;
    act(() => ws.open());
    act(() => ws.emit(roomJoined()));
    act(() => ws.emit(minimalState()));
    return { hook, ws };
  };
  const MANEUVER = { type: "MANEUVER", player: "p1" } as never;
  const actionsSent = (ws: FakeWebSocket) => ws.sentTypes.filter((t) => t === "ACTION").length;

  it("a second tap before the STATE reply sends the action once, and never trips the loss screen", () => {
    const { hook, ws } = bootIntoGame();

    // Thumb-bounce: two rapid taps on the Maneuver tile, no STATE in between.
    act(() => hook.result.current.sendAction(MANEUVER));
    act(() => hook.result.current.sendAction(MANEUVER));
    expect(actionsSent(ws)).toBe(1);
    expect(hook.result.current.gameLost).toBe(false);
    expect(hook.result.current.error).toBeNull();

    // The STATE that answers the first tap re-arms the guard for the next decision.
    act(() => ws.emit(minimalState()));
    act(() => hook.result.current.sendAction({ type: "END_TURN", player: "p1" } as never));
    expect(actionsSent(ws)).toBe(2);
  });

  it("guards prompt answers the same way", () => {
    const { hook, ws } = bootIntoGame();
    act(() => hook.result.current.respondToPrompt("pr1", "yes"));
    act(() => hook.result.current.respondToPrompt("pr1", "yes"));
    expect(actionsSent(ws)).toBe(1);
  });

  // #847: the guard is a DUPLICATE guard, not a one-action-per-reply gate.
  const END_TURN = { type: "END_TURN", player: "p1" } as never;
  const actionPayloads = (ws: FakeWebSocket) =>
    ws.sent.map((f) => JSON.parse(f)).filter((m) => m.type === "ACTION").map((m) => m.action);

  it("two DIFFERENT actions before the STATE reply both go out, in order (#847)", () => {
    const { hook, ws } = bootIntoGame();
    // Two rapid hotkeys: Maneuver then End turn, no STATE in between.
    act(() => hook.result.current.sendAction(MANEUVER));
    act(() => hook.result.current.sendAction(END_TURN));
    expect(actionPayloads(ws)).toEqual([MANEUVER, END_TURN]);
    expect(hook.result.current.gameLost).toBe(false);
  });

  it("still drops a repeat of an in-flight action, even with another action sent between", () => {
    const { hook, ws } = bootIntoGame();
    act(() => hook.result.current.sendAction(MANEUVER));
    act(() => hook.result.current.sendAction(END_TURN));
    act(() => hook.result.current.sendAction(MANEUVER)); // bounce of the first tap
    act(() => hook.result.current.sendAction(END_TURN)); // bounce of the second
    expect(actionPayloads(ws)).toEqual([MANEUVER, END_TURN]);

    // The reply frees both: the same actions may be sent again for the next decision.
    act(() => ws.emit(minimalState()));
    act(() => hook.result.current.sendAction(MANEUVER));
    expect(actionsSent(ws)).toBe(3);
  });

  it("dedupes on the payload, not the object: an equal action built fresh is the same tap", () => {
    const { hook, ws } = bootIntoGame();
    act(() => hook.result.current.sendAction({ type: "MANEUVER", player: "p1" } as never));
    act(() => hook.result.current.sendAction({ type: "MANEUVER", player: "p1" } as never));
    expect(actionsSent(ws)).toBe(1);
  });

  it("guards prompt answers per option: a different answer goes out, the same one is dropped", () => {
    const { hook, ws } = bootIntoGame();
    act(() => hook.result.current.respondToPrompt("pr1", "yes"));
    act(() => hook.result.current.respondToPrompt("pr1", "no"));
    act(() => hook.result.current.respondToPrompt("pr1", "yes"));
    expect(actionPayloads(ws).map((a) => a.optionId)).toEqual(["yes", "no"]);
  });

  it("tells the caller whether the frame went out, so optimistic UI can skip a dropped send", () => {
    jest.useFakeTimers(); // the close below schedules a reconnect — keep it off real timers
    const { hook, ws } = bootIntoGame();
    let first = false;
    let repeat = true;
    let other = false;
    let prompt = false;
    let promptRepeat = true;
    act(() => {
      first = hook.result.current.sendAction(MANEUVER);
      repeat = hook.result.current.sendAction(MANEUVER);
      other = hook.result.current.sendAction(END_TURN);
      prompt = hook.result.current.respondToPrompt("pr1", "yes");
      promptRepeat = hook.result.current.respondToPrompt("pr1", "yes");
    });
    expect([first, repeat, other, prompt, promptRepeat]).toEqual([true, false, true, true, false]);
    expect(actionsSent(ws)).toBe(3);

    // Nothing goes out on a closed socket either — and the caller hears that too.
    act(() => ws.close());
    let closed = true;
    act(() => {
      closed = hook.result.current.sendAction(MANEUVER);
    });
    expect(closed).toBe(false);
    expect(actionsSent(ws)).toBe(3);
  });

  it("times out each in-flight action on its own, never a different one with it", () => {
    jest.useFakeTimers();
    const { hook, ws } = bootIntoGame();
    act(() => hook.result.current.sendAction(MANEUVER));
    act(() => jest.advanceTimersByTime(ACTION_IN_FLIGHT_MS / 2));
    act(() => hook.result.current.sendAction(END_TURN));
    expect(actionsSent(ws)).toBe(2);

    // The first action's window has lapsed; the second's has not.
    act(() => jest.advanceTimersByTime(ACTION_IN_FLIGHT_MS / 2 + 1));
    act(() => hook.result.current.sendAction(END_TURN));
    expect(actionsSent(ws)).toBe(2);
    act(() => hook.result.current.sendAction(MANEUVER));
    expect(actionsSent(ws)).toBe(3);
  });

  it("treats ERROR{ILLEGAL_ACTION} as non-fatal: notice latched, board live, no loss screen", () => {
    const { hook, ws } = bootIntoGame();
    act(() => hook.result.current.sendAction(MANEUVER));
    act(() => ws.emit({ type: "ERROR", code: "ILLEGAL_ACTION", message: "not legal" }));

    expect(hook.result.current.illegalAction).toBe(true);
    expect(hook.result.current.gameLost).toBe(false);
    expect(hook.result.current.error).toBeNull();
    expect(hook.result.current.serverError).toBe(false); // its own notice, not SERVER_ERROR's
    expect(hook.result.current.snapshot).not.toBeNull();

    // The rejection answered the in-flight action: the player can act again at once.
    act(() => hook.result.current.sendAction({ type: "END_TURN", player: "p1" } as never));
    expect(actionsSent(ws)).toBe(2);

    act(() => hook.result.current.acknowledgeIllegalAction());
    expect(hook.result.current.illegalAction).toBe(false);
  });

  it("a reply that never comes cannot leave the player unable to act", () => {
    jest.useFakeTimers();
    const { hook, ws } = bootIntoGame();
    act(() => hook.result.current.sendAction(MANEUVER));
    act(() => jest.advanceTimersByTime(ACTION_IN_FLIGHT_MS - 1));
    act(() => hook.result.current.sendAction(MANEUVER));
    expect(actionsSent(ws)).toBe(1);

    act(() => jest.advanceTimersByTime(2));
    act(() => hook.result.current.sendAction(MANEUVER));
    expect(actionsSent(ws)).toBe(2);
  });

  it("a socket close drops the in-flight guard with the socket", () => {
    jest.useFakeTimers();
    const randSpy = jest.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      const { hook, ws } = bootIntoGame();
      act(() => hook.result.current.sendAction(MANEUVER));
      expect(actionsSent(ws)).toBe(1);

      // The socket drops with the action unanswered; the jittered backoff
      // (random=0.5 → 500ms) opens a fresh one, whose first STATE is the resume.
      act(() => ws.close());
      act(() => jest.advanceTimersByTime(501));
      const next = FakeWebSocket.last!;
      expect(next).not.toBe(ws);
      act(() => next.open());
      act(() => next.emit(minimalState()));

      // Well inside ACTION_IN_FLIGHT_MS of the lost send, yet the player can act.
      act(() => hook.result.current.sendAction(MANEUVER));
      expect(actionsSent(next)).toBe(1);
    } finally {
      randSpy.mockRestore();
    }
  });
});


describe("useProSocket — stale-view resync after repeated ILLEGAL_ACTION (p2p #848)", () => {
  const realWS = global.WebSocket;
  beforeEach(() => {
    // @ts-expect-error — swap in the fake for the test
    global.WebSocket = FakeWebSocket;
    window.localStorage.clear();
    window.sessionStorage.clear();
    jest.useFakeTimers();
  });
  afterEach(() => {
    global.WebSocket = realWS;
    FakeWebSocket.last = null;
    jest.useRealTimers();
  });

  const bootIntoGame = () => {
    const hook = renderHook(() => useProSocket("ws://test"));
    const ws = FakeWebSocket.last!;
    act(() => ws.open());
    act(() => ws.emit(roomJoined()));
    act(() => ws.emit(minimalState()));
    // The open handshake sent one RECONNECT-free hello; count from here.
    expect(ws.sentTypes.filter((t) => t === "RECONNECT")).toHaveLength(0);
    return { hook, ws };
  };
  const MANEUVER = { type: "MANEUVER", player: "p1" } as never;
  const reconnects = (ws: FakeWebSocket) => ws.sentTypes.filter((t) => t === "RECONNECT").length;
  const reject = (ws: FakeWebSocket) =>
    act(() => ws.emit({ type: "ERROR", code: "ILLEGAL_ACTION", message: "not legal" }));
  // Tap → rejected. The ERROR frees the in-flight guard, so the next tap sends.
  const tapAndGetRejected = (hook: ReturnType<typeof bootIntoGame>["hook"], ws: FakeWebSocket) => {
    act(() => hook.result.current.sendAction(MANEUVER));
    reject(ws);
  };

  it("one rejection is the ordinary late double-tap: toast only, no resync (#840 unchanged)", () => {
    const { hook, ws } = bootIntoGame();
    tapAndGetRejected(hook, ws);

    expect(hook.result.current.illegalAction).toBe(true);
    expect(hook.result.current.resyncing).toBe(false);
    expect(reconnects(ws)).toBe(0);
    expect(hook.result.current.gameLost).toBe(false);
  });

  it("rejections separated by a STATE never add up to a resync", () => {
    const { hook, ws } = bootIntoGame();
    for (let i = 0; i < ILLEGAL_ACTION_RESYNC_AFTER + 1; i++) {
      tapAndGetRejected(hook, ws);
      act(() => hook.result.current.acknowledgeIllegalAction());
      act(() => ws.emit(minimalState())); // a fresh view lands in between each time
    }
    expect(reconnects(ws)).toBe(0);
    expect(hook.result.current.resyncing).toBe(false);
  });

  it("consecutive rejections with no STATE between them re-send RECONNECT once and latch `resyncing`", () => {
    const { hook, ws } = bootIntoGame();
    for (let i = 0; i < ILLEGAL_ACTION_RESYNC_AFTER; i++) tapAndGetRejected(hook, ws);

    expect(reconnects(ws)).toBe(1);
    const frame = JSON.parse(ws.sent[ws.sent.length - 1]);
    expect(frame).toMatchObject({ type: "RECONNECT", roomId: "R1", token: "tok" });
    expect(hook.result.current.resyncing).toBe(true);
    // The resync replaces the per-rejection toast for the rejection that triggered it.
    expect(hook.result.current.illegalAction).toBe(false);
    expect(hook.result.current.gameLost).toBe(false);
    expect(hook.result.current.error).toBeNull();

    // The server answers a RECONNECT with ROOM_JOINED + a fresh STATE: resync done.
    act(() => ws.emit(roomJoined()));
    act(() => ws.emit(minimalState()));
    expect(hook.result.current.resyncing).toBe(false);
    expect(hook.result.current.snapshot).not.toBeNull();

    // Back to a clean slate: a single later rejection is a toast again, not a resync.
    tapAndGetRejected(hook, ws);
    expect(reconnects(ws)).toBe(1);
    expect(hook.result.current.illegalAction).toBe(true);
  });

  it("a client still rejected right after a fresh view is throttled to the toast, then may resync again", () => {
    const { hook, ws } = bootIntoGame();
    for (let i = 0; i < ILLEGAL_ACTION_RESYNC_AFTER; i++) tapAndGetRejected(hook, ws);
    expect(reconnects(ws)).toBe(1);
    act(() => ws.emit(roomJoined()));
    act(() => ws.emit(minimalState()));

    // Inside the cooldown: the streak fills again but no second RECONNECT goes out.
    act(() => jest.advanceTimersByTime(RESYNC_COOLDOWN_MS - 1));
    for (let i = 0; i < ILLEGAL_ACTION_RESYNC_AFTER; i++) tapAndGetRejected(hook, ws);
    expect(reconnects(ws)).toBe(1);
    expect(hook.result.current.resyncing).toBe(false);
    expect(hook.result.current.illegalAction).toBe(true); // the plain notice still fires

    // Once the cooldown has passed, the next rejection in the streak resyncs again.
    act(() => jest.advanceTimersByTime(2));
    tapAndGetRejected(hook, ws);
    expect(reconnects(ws)).toBe(2);
    expect(hook.result.current.resyncing).toBe(true);
  });

  it("a socket close mid-resync drops the latch — the next socket's open re-syncs anyway", () => {
    const randSpy = jest.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      const { hook, ws } = bootIntoGame();
      for (let i = 0; i < ILLEGAL_ACTION_RESYNC_AFTER; i++) tapAndGetRejected(hook, ws);
      expect(hook.result.current.resyncing).toBe(true);

      act(() => ws.close());
      expect(hook.result.current.resyncing).toBe(false);
      act(() => jest.advanceTimersByTime(501));
      const next = FakeWebSocket.last!;
      expect(next).not.toBe(ws);
      act(() => next.open());
      expect(next.sentTypes).toContain("RECONNECT"); // the ordinary post-drop path
      act(() => next.emit(roomJoined()));
      act(() => next.emit(minimalState()));
      // Fresh socket, fresh streak: one rejection is a toast, not a resync.
      tapAndGetRejected(hook, next);
      expect(reconnects(next)).toBe(1);
      expect(hook.result.current.illegalAction).toBe(true);
    } finally {
      randSpy.mockRestore();
    }
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

// ---------------------------------------------------------------------------
// Per-decision move timer (issue #223, engine #122): CREATE_ROOM.turnTimerSeconds,
// echoed setting, TURN_TIMER broadcasts, and own-clock expiry detection.
// ---------------------------------------------------------------------------

describe("useProSocket — move timer wire (issue #223)", () => {
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

  const boot = () => {
    const hook = renderHook(() => useProSocket("ws://test"));
    const ws = FakeWebSocket.last!;
    act(() => ws.open());
    return { hook, ws };
  };

  it("CREATE_ROOM includes turnTimerSeconds when a timer is set, omits it when off", () => {
    const { hook, ws } = boot();
    act(() => hook.result.current.createRoom("hero-a", undefined, undefined, "duel", [], 30));
    const timed = ws.sent.map((s) => JSON.parse(s)).find((m) => m.type === "CREATE_ROOM");
    expect(timed.turnTimerSeconds).toBe(30);

    ws.sent.length = 0;
    act(() => hook.result.current.createRoom("hero-a")); // no timer arg
    const untimed = ws.sent.map((s) => JSON.parse(s)).find((m) => m.type === "CREATE_ROOM");
    expect(untimed).toBeDefined();
    expect("turnTimerSeconds" in untimed).toBe(false);

    ws.sent.length = 0;
    act(() => hook.result.current.createRoom("hero-a", undefined, undefined, "duel", [], 0));
    const zero = ws.sent.map((s) => JSON.parse(s)).find((m) => m.type === "CREATE_ROOM");
    expect("turnTimerSeconds" in zero).toBe(false); // 0 = off → omitted
  });

  it("surfaces the room's turnTimerSeconds from ROOM_CREATED / ROOM_JOINED / ROOM_STATUS", () => {
    const { hook, ws } = boot();
    act(() => ws.emit({ type: "ROOM_CREATED", roomId: "R1", token: "t", you: "p1", turnTimerSeconds: 45 }));
    expect(hook.result.current.roomInfo?.turnTimerSeconds).toBe(45);

    act(() =>
      ws.emit({
        type: "ROOM_STATUS",
        roomId: "R1",
        formatId: "duel",
        requiredPlayers: 2,
        seats: [{ player: "p1", heroId: "medusa", connected: true, bot: null }],
        turnTimerSeconds: 45,
      })
    );
    expect(hook.result.current.roomInfo?.turnTimerSeconds).toBe(45);
  });

  it("an untimed room leaves turnTimerSeconds undefined and never sets turnTimer", () => {
    const { hook, ws } = boot();
    act(() => ws.emit({ type: "ROOM_JOINED", roomId: "R1", token: "t", you: "p1" }));
    act(() => ws.emit(minimalState()));
    expect(hook.result.current.roomInfo?.turnTimerSeconds).toBeUndefined();
    expect(hook.result.current.turnTimer).toBeNull();
  });

  it("tracks the latest TURN_TIMER broadcast (which seat, and the deadline)", () => {
    const { hook, ws } = boot();
    act(() => ws.emit({ type: "ROOM_JOINED", roomId: "R1", token: "t", you: "p1", turnTimerSeconds: 30 }));
    act(() => ws.emit(minimalState()));

    act(() => ws.emit({ type: "TURN_TIMER", player: "p1", deadline: 1_000_000 }));
    expect(hook.result.current.turnTimer).toEqual({ player: "p1", deadline: 1_000_000 });

    // resync to a fresh deadline / next actor
    act(() => ws.emit({ type: "TURN_TIMER", player: "p2", deadline: 2_000_000 }));
    expect(hook.result.current.turnTimer).toEqual({ player: "p2", deadline: 2_000_000 });

    // paused clock (bot/disconnected) → deadline null
    act(() => ws.emit({ type: "TURN_TIMER", player: "p2", deadline: null }));
    expect(hook.result.current.turnTimer).toEqual({ player: "p2", deadline: null });
  });

  it("latches ownTimerExpired when the viewer's own clock lapses and the server moves on", () => {
    jest.spyOn(Date, "now").mockReturnValue(1_000_000);
    try {
      const { hook, ws } = boot();
      act(() => ws.emit({ type: "ROOM_JOINED", roomId: "R1", token: "t", you: "p1", turnTimerSeconds: 30 }));
      act(() => ws.emit(minimalState()));

      // our clock is armed with a deadline 10s out
      act(() => ws.emit({ type: "TURN_TIMER", player: "p1", deadline: 1_010_000 }));
      expect(hook.result.current.ownTimerExpired).toBe(false);

      // wall clock passes the deadline WITHOUT us acting; the server injects a move
      // and broadcasts the next actor's clock → our lapse is a genuine timeout.
      (Date.now as jest.Mock).mockReturnValue(1_011_000);
      act(() => ws.emit({ type: "TURN_TIMER", player: "p2", deadline: 1_041_000 }));
      expect(hook.result.current.ownTimerExpired).toBe(true);

      act(() => hook.result.current.acknowledgeOwnTimerExpired());
      expect(hook.result.current.ownTimerExpired).toBe(false);
    } finally {
      (Date.now as jest.Mock).mockRestore();
    }
  });

  it("does NOT latch when the viewer acted before the deadline (move at the wire)", () => {
    jest.spyOn(Date, "now").mockReturnValue(1_000_000);
    try {
      const { hook, ws } = boot();
      act(() => ws.emit({ type: "ROOM_JOINED", roomId: "R1", token: "t", you: "p1", turnTimerSeconds: 30 }));
      act(() => ws.emit(minimalState()));
      act(() => ws.emit({ type: "TURN_TIMER", player: "p1", deadline: 1_010_000 }));

      // we act just before the deadline…
      (Date.now as jest.Mock).mockReturnValue(1_009_500);
      act(() => hook.result.current.sendAction({ type: "END_TURN", player: "p1" } as never));
      // …and the round-trip TURN_TIMER for the next actor lands a hair after it
      (Date.now as jest.Mock).mockReturnValue(1_010_200);
      act(() => ws.emit({ type: "TURN_TIMER", player: "p2", deadline: 1_040_000 }));

      expect(hook.result.current.ownTimerExpired).toBe(false); // our move, not a timeout
    } finally {
      (Date.now as jest.Mock).mockRestore();
    }
  });

  it("does NOT latch on an OPPONENT's clock expiry (their move just advances)", () => {
    jest.spyOn(Date, "now").mockReturnValue(1_000_000);
    try {
      const { hook, ws } = boot();
      act(() => ws.emit({ type: "ROOM_JOINED", roomId: "R1", token: "t", you: "p1", turnTimerSeconds: 30 }));
      act(() => ws.emit(minimalState()));

      // opponent p2 is on the clock and times out
      act(() => ws.emit({ type: "TURN_TIMER", player: "p2", deadline: 1_010_000 }));
      (Date.now as jest.Mock).mockReturnValue(1_011_000);
      act(() => ws.emit({ type: "TURN_TIMER", player: "p1", deadline: 1_041_000 }));

      expect(hook.result.current.ownTimerExpired).toBe(false);
    } finally {
      (Date.now as jest.Mock).mockRestore();
    }
  });

  it("does NOT latch on a pause (disconnect) before the deadline", () => {
    jest.spyOn(Date, "now").mockReturnValue(1_000_000);
    try {
      const { hook, ws } = boot();
      act(() => ws.emit({ type: "ROOM_JOINED", roomId: "R1", token: "t", you: "p1", turnTimerSeconds: 30 }));
      act(() => ws.emit(minimalState()));
      act(() => ws.emit({ type: "TURN_TIMER", player: "p1", deadline: 1_010_000 }));

      // we drop with 5s left; the server pauses our clock (deadline null)
      (Date.now as jest.Mock).mockReturnValue(1_005_000);
      act(() => ws.emit({ type: "TURN_TIMER", player: "p1", deadline: null }));

      expect(hook.result.current.ownTimerExpired).toBe(false); // paused, not expired
    } finally {
      (Date.now as jest.Mock).mockRestore();
    }
  });

  it("clears the bar and any armed own-clock when the game ends (winner set)", () => {
    jest.spyOn(Date, "now").mockReturnValue(1_000_000);
    try {
      const { hook, ws } = boot();
      act(() => ws.emit({ type: "ROOM_JOINED", roomId: "R1", token: "t", you: "p1", turnTimerSeconds: 30 }));
      act(() => ws.emit(minimalState()));
      act(() => ws.emit({ type: "TURN_TIMER", player: "p1", deadline: 1_010_000 }));
      expect(hook.result.current.turnTimer).not.toBeNull();

      // game-over STATE (a winner is decided): the bar clears, no "time's up" toast
      (Date.now as jest.Mock).mockReturnValue(1_011_000);
      act(() =>
        ws.emit({ type: "STATE", view: { you: "p1", prompt: null, activePlayer: "p1", winner: "p1" }, legalActions: [] })
      );
      expect(hook.result.current.turnTimer).toBeNull();
      expect(hook.result.current.ownTimerExpired).toBe(false);
    } finally {
      (Date.now as jest.Mock).mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// Opening-hand mulligan opt-out (issue #631, engine #395). The engine defaults
// the window ON, so the load-bearing assertion is that a DEFAULT room's
// CREATE_ROOM does not grow the key at all — only an explicit opt-out is sent.
// ---------------------------------------------------------------------------

describe("useProSocket — mulligan opt-out wire (issue #631)", () => {
  const realWS = global.WebSocket;
  beforeEach(() => {
    // @ts-expect-error — swap in the fake for the test
    global.WebSocket = FakeWebSocket;
    // Both stores: a seat token left by an earlier suite would turn the
    // JOIN_ROOM case below into a RECONNECT.
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  afterEach(() => {
    global.WebSocket = realWS;
    FakeWebSocket.last = null;
  });

  const boot = () => {
    const hook = renderHook(() => useProSocket("ws://test"));
    const ws = FakeWebSocket.last!;
    act(() => ws.open());
    return { hook, ws };
  };

  const created = (ws: FakeWebSocket) =>
    ws.sent.map((raw) => JSON.parse(raw)).find((m) => m.type === "CREATE_ROOM");

  it("sends mulligan: false only when the creator turns it off", () => {
    const { hook, ws } = boot();
    act(() => hook.result.current.createRoom("hero-a", undefined, undefined, "duel", [], 0, false));
    expect(created(ws).mulligan).toBe(false);
  });

  it("omits the key for a default room (mulligan on) — byte-identical to today", () => {
    const { hook, ws } = boot();
    act(() => hook.result.current.createRoom("hero-a", undefined, undefined, "duel", [], 0, true));
    expect("mulligan" in created(ws)).toBe(false);

    ws.sent.length = 0;
    act(() => hook.result.current.createRoom("hero-a")); // arg omitted entirely
    expect("mulligan" in created(ws)).toBe(false);
  });

  it("rides alongside a bot room and a move timer", () => {
    const { hook, ws } = boot();
    act(() =>
      hook.result.current.createRoom(
        "hero-a",
        { difficulty: "easy" },
        undefined,
        "duel",
        [],
        30,
        false,
      ),
    );
    expect(created(ws)).toMatchObject({ bot: { difficulty: "easy" }, turnTimerSeconds: 30, mulligan: false });
  });

  it("never puts the flag on JOIN_ROOM — it is creator-only room config", () => {
    const { hook, ws } = boot();
    act(() => hook.result.current.joinRoom("R1", "hero-b"));
    const join = ws.sent.map((raw) => JSON.parse(raw)).find((m) => m.type === "JOIN_ROOM");
    expect(join).toBeDefined();
    expect("mulligan" in join).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Battlefield items opt-out (issue #725, engine #519). Same load-bearing shape
// as mulligan: items are printed on the map, so ON is the default and only an
// explicit opt-out may grow the CREATE_ROOM frame — and the caller (the lobby)
// passes the flag only when the chosen board carries items at all.
// ---------------------------------------------------------------------------

describe("useProSocket — items opt-out wire (issue #725)", () => {
  const realWS = global.WebSocket;
  beforeEach(() => {
    // @ts-expect-error — swap in the fake for the test
    global.WebSocket = FakeWebSocket;
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  afterEach(() => {
    global.WebSocket = realWS;
    FakeWebSocket.last = null;
  });

  const boot = () => {
    const hook = renderHook(() => useProSocket("ws://test"));
    const ws = FakeWebSocket.last!;
    act(() => ws.open());
    return { hook, ws };
  };

  const created = (ws: FakeWebSocket) =>
    ws.sent.map((raw) => JSON.parse(raw)).find((m) => m.type === "CREATE_ROOM");

  it("sends itemsEnabled: false only when the creator turns items off", () => {
    const { hook, ws } = boot();
    act(() => hook.result.current.createRoom("hero-a", undefined, undefined, "duel", [], 0, undefined, undefined, false));
    expect(created(ws).itemsEnabled).toBe(false);
  });

  it("omits the key for a default room (items on) — byte-identical to today", () => {
    const { hook, ws } = boot();
    act(() => hook.result.current.createRoom("hero-a", undefined, undefined, "duel", [], 0, undefined, undefined, true));
    expect("itemsEnabled" in created(ws)).toBe(false);

    ws.sent.length = 0;
    act(() => hook.result.current.createRoom("hero-a")); // arg omitted entirely
    expect("itemsEnabled" in created(ws)).toBe(false);
  });

  it("rides alongside the mulligan opt-out and a move timer", () => {
    const { hook, ws } = boot();
    act(() =>
      hook.result.current.createRoom("hero-a", undefined, undefined, "duel", [], 30, false, undefined, false),
    );
    expect(created(ws)).toMatchObject({ turnTimerSeconds: 30, mulligan: false, itemsEnabled: false });
  });

  it("leaves a quickMatch room untouched — its rolled board was never offered the chip", () => {
    const { hook, ws } = boot();
    act(() => hook.result.current.createRoom("hero-a", undefined, undefined, "duel", [], 0, undefined, true));
    expect(created(ws).quickMatch).toBe(true);
    expect("itemsEnabled" in created(ws)).toBe(false);
  });

  it("never puts the flag on JOIN_ROOM — it is creator-only room config", () => {
    const { hook, ws } = boot();
    act(() => hook.result.current.joinRoom("R1", "hero-b"));
    const join = ws.sent.map((raw) => JSON.parse(raw)).find((m) => m.type === "JOIN_ROOM");
    expect(join).toBeDefined();
    expect("itemsEnabled" in join).toBe(false);
  });
});

/**
 * Optional player identity on the wire (issue #568, engine #344).
 *
 * The load-bearing assertion is the GUEST one: with nobody signed in, the
 * CREATE_ROOM/JOIN_ROOM frames must not grow a single key, because that is what
 * lets this client talk to the live engine exactly as today's `main` does.
 */
describe("useProSocket — player identity on create/join", () => {
  const realWS = global.WebSocket;
  beforeEach(() => {
    // @ts-expect-error — swap in the fake for the test
    global.WebSocket = FakeWebSocket;
    window.localStorage.clear();
    window.sessionStorage.clear();
    mockAccount = { status: "guest", account: null };
    mockBadge = [];
  });
  afterEach(() => {
    global.WebSocket = realWS;
    FakeWebSocket.last = null;
  });

  const signIn = () => {
    mockAccount = {
      status: "signed-in",
      account: { id: "discord-42", username: "JollyGrin", avatarUrl: "https://cdn/x.png" },
    };
  };

  const boot = () => {
    const hook = renderHook(() => useProSocket("ws://test"));
    const ws = FakeWebSocket.last!;
    act(() => ws.open());
    return { hook, ws };
  };

  const frame = (ws: FakeWebSocket, type: string) =>
    JSON.parse(ws.sent.find((s) => JSON.parse(s).type === type)!);

  it("sends nothing extra for a guest — CREATE_ROOM is byte-identical to today", () => {
    const { hook, ws } = boot();
    act(() => hook.result.current.createRoom("king-kong"));

    const msg = frame(ws, "CREATE_ROOM");
    expect(msg).not.toHaveProperty("displayName");
    expect(msg).not.toHaveProperty("playerId");
  });

  it("sends nothing extra for a guest on JOIN_ROOM either", () => {
    const { hook, ws } = boot();
    act(() => hook.result.current.joinRoom("R1", "king-kong"));

    const msg = frame(ws, "JOIN_ROOM");
    expect(msg).not.toHaveProperty("displayName");
    expect(msg).not.toHaveProperty("playerId");
  });

  it("sends the Discord name and account id on CREATE_ROOM when signed in", () => {
    signIn();
    const { hook, ws } = boot();
    act(() => hook.result.current.createRoom("king-kong"));

    expect(frame(ws, "CREATE_ROOM")).toMatchObject({
      displayName: "JollyGrin",
      playerId: "discord-42",
    });
  });

  it("sends them on JOIN_ROOM too, so the joiner's name reaches the host", () => {
    signIn();
    const { hook, ws } = boot();
    act(() => hook.result.current.joinRoom("R1", "king-kong"));

    expect(frame(ws, "JOIN_ROOM")).toMatchObject({
      displayName: "JollyGrin",
      playerId: "discord-42",
    });
  });

  it("keeps identity off RECONNECT — the server kept the seat, name included", () => {
    signIn();
    const { hook, ws } = boot();
    act(() => hook.result.current.joinRoom("R1", "king-kong"));
    act(() => ws.emit({ type: "ROOM_JOINED", roomId: "R1", token: "tok", you: "p1" }));

    // a refresh-style rejoin now finds this tab's token and reconnects instead
    act(() => hook.result.current.joinRoom("R1", ""));
    const msg = frame(ws, "RECONNECT");
    expect(msg).not.toHaveProperty("displayName");
    expect(msg).not.toHaveProperty("playerId");
  });

  it("stays a guest on the wire while the /me probe is still in flight", () => {
    mockAccount = { status: "loading", account: null };
    const { hook, ws } = boot();
    act(() => hook.result.current.createRoom("king-kong"));

    const msg = frame(ws, "CREATE_ROOM");
    expect(msg).not.toHaveProperty("displayName");
    expect(msg).not.toHaveProperty("playerId");
  });
});

/**
 * The worn badge on the wire (issue #577, engine #347).
 *
 * The gate is the pair: signed in AND wearing something. Either half missing
 * and the frame must not grow the key — a badge id left over in a store after a
 * sign-out is the one way a guest's frame could stop being byte-identical.
 */
describe("useProSocket — worn badges on create/join", () => {
  const realWS = global.WebSocket;
  beforeEach(() => {
    // @ts-expect-error — swap in the fake for the test
    global.WebSocket = FakeWebSocket;
    window.localStorage.clear();
    window.sessionStorage.clear();
    mockAccount = { status: "guest", account: null };
    mockBadge = [];
  });
  afterEach(() => {
    global.WebSocket = realWS;
    FakeWebSocket.last = null;
  });

  const signIn = () => {
    mockAccount = {
      status: "signed-in",
      account: { id: "discord-42", username: "JollyGrin", avatarUrl: null },
    };
  };

  const boot = () => {
    const hook = renderHook(() => useProSocket("ws://test"));
    const ws = FakeWebSocket.last!;
    act(() => ws.open());
    return { hook, ws };
  };

  const frame = (ws: FakeWebSocket, type: string) =>
    JSON.parse(ws.sent.find((s) => JSON.parse(s).type === type)!);

  it("sends the badge on CREATE_ROOM when signed in and wearing one", () => {
    signIn();
    mockBadge = ["bot-slayer", "veteran"];
    const { hook, ws } = boot();
    act(() => hook.result.current.createRoom("king-kong"));

    expect(frame(ws, "CREATE_ROOM")).toMatchObject({
      displayName: "JollyGrin",
      // The array is the new field; `badge` carries slot 1 for a release.
      badge: "bot-slayer",
      badges: ["bot-slayer", "veteran"],
    });
  });

  it("sends it on JOIN_ROOM too, so the host's HUD gets the chip", () => {
    signIn();
    mockBadge = ["streak-5"];
    const { hook, ws } = boot();
    act(() => hook.result.current.joinRoom("R1", "king-kong"));

    expect(frame(ws, "JOIN_ROOM")).toMatchObject({
      badge: "streak-5",
      badges: ["streak-5"],
    });
  });

  it("omits the key entirely when signed in but wearing nothing", () => {
    signIn();
    const { hook, ws } = boot();
    act(() => hook.result.current.createRoom("king-kong"));

    expect(frame(ws, "CREATE_ROOM")).not.toHaveProperty("badge");
    expect(frame(ws, "CREATE_ROOM")).not.toHaveProperty("badges");
  });

  it("omits it for a guest even with badge ids still in the store", () => {
    mockBadge = ["veteran"];
    const { hook, ws } = boot();
    act(() => hook.result.current.createRoom("king-kong"));
    act(() => hook.result.current.joinRoom("R1", "king-kong"));

    expect(frame(ws, "CREATE_ROOM")).not.toHaveProperty("badge");
    expect(frame(ws, "CREATE_ROOM")).not.toHaveProperty("badges");
    expect(frame(ws, "JOIN_ROOM")).not.toHaveProperty("badge");
    expect(frame(ws, "JOIN_ROOM")).not.toHaveProperty("badges");
  });

  it("keeps the badges off RECONNECT — the server kept the seat and its chips", () => {
    signIn();
    mockBadge = ["veteran"];
    const { hook, ws } = boot();
    act(() => hook.result.current.joinRoom("R1", "king-kong"));
    act(() => ws.emit({ type: "ROOM_JOINED", roomId: "R1", token: "tok", you: "p1" }));

    act(() => hook.result.current.joinRoom("R1", ""));
    expect(frame(ws, "RECONNECT")).not.toHaveProperty("badge");
    expect(frame(ws, "RECONNECT")).not.toHaveProperty("badges");
  });
});

/**
 * The equipped cosmetics blob on the wire (issue #615, engine #392).
 *
 * The gate is the same pair as the badge's — signed in AND something equipped
 * FOR THIS HERO — with one extra property to hold: what goes on the wire is IDS
 * ONLY. A URL, a title, or inline data in this field would be the invariant
 * breaking, not a cosmetic bug, so the shape is asserted and not just the
 * presence.
 */
describe("useProSocket — equipped cosmetics on create/join", () => {
  const realWS = global.WebSocket;
  beforeEach(() => {
    // @ts-expect-error — swap in the fake for the test
    global.WebSocket = FakeWebSocket;
    window.localStorage.clear();
    window.sessionStorage.clear();
    mockAccount = { status: "guest", account: null };
    mockBadge = [];
    mockCosmetics = [];
  });
  afterEach(() => {
    global.WebSocket = realWS;
    FakeWebSocket.last = null;
  });

  const signIn = () => {
    mockAccount = {
      status: "signed-in",
      account: { id: "discord-42", username: "JollyGrin", avatarUrl: null },
    };
  };

  const row = (over: Partial<HeroCosmetics>): HeroCosmetics => ({
    heroId: "king-kong",
    earned: 900,
    spent: 0,
    adjusted: 0,
    available: 900,
    cards: [],
    tokenRim: { unlockedTier: 0, enabled: false, selectedTier: null },
    cardRims: { enabled: true, selectedTier: null },
    ...over,
  });

  const equip = () => {
    mockCosmetics = [
      row({
        heroId: "king-kong",
        cards: [{ key: "brute strength", tier: 3 }],
        tokenRim: { unlockedTier: 2, enabled: true, selectedTier: null },
      }),
      // A hero with card rims but the token rim switched OFF on /collection.
      row({
        heroId: "thrall",
        cards: [{ key: "warchief", tier: 1 }],
        tokenRim: { unlockedTier: 4, enabled: false, selectedTier: null },
      }),
    ];
  };

  const boot = () => {
    const hook = renderHook(() => useProSocket("ws://test"));
    const ws = FakeWebSocket.last!;
    act(() => ws.open());
    return { hook, ws };
  };

  const frame = (ws: FakeWebSocket, type: string) =>
    JSON.parse(ws.sent.find((s) => JSON.parse(s).type === type)!);

  it("sends the blob for the hero being played on CREATE_ROOM", () => {
    signIn();
    equip();
    const { hook, ws } = boot();
    act(() => hook.result.current.createRoom("king-kong"));

    const { cosmetics } = frame(ws, "CREATE_ROOM");
    expect(typeof cosmetics).toBe("string");
    const decoded = decodeCosmetics(cosmetics);
    expect(decoded.tokenRim).toBe("silver");
    expect(wireCardRim(decoded, "Brute Strength")).toBe("gold");
  });

  it("sends the blob for the hero being played on JOIN_ROOM", () => {
    signIn();
    equip();
    const { hook, ws } = boot();
    act(() => hook.result.current.joinRoom("R1", "thrall"));

    const { cosmetics } = frame(ws, "JOIN_ROOM");
    expect(decodeCosmetics(cosmetics).tokenRim).toBeNull();
    expect(wireCardRim(decodeCosmetics(cosmetics), "Warchief")).toBe("bronze");
  });

  // #627: the card-rims switch is honoured by `wireLoadoutFor`, so the JOIN
  // blob — and therefore own hand, opponent view and deck preview, which all
  // project through this one encoder — carries zero card entries.
  it("sends ZERO card entries for a hero with card rims switched off", () => {
    signIn();
    mockCosmetics = [
      row({
        heroId: "king-kong",
        cards: [{ key: "brute strength", tier: 3 }],
        tokenRim: { unlockedTier: 2, enabled: true, selectedTier: null },
        cardRims: { enabled: false, selectedTier: null },
      }),
    ];
    const { hook, ws } = boot();
    act(() => hook.result.current.joinRoom("R1", "king-kong"));

    const { cosmetics } = frame(ws, "JOIN_ROOM");
    const decoded = decodeCosmetics(cosmetics);
    // The earned token rim is a separate pref and still crosses.
    expect(decoded.tokenRim).toBe("silver");
    expect(decoded.cardsByHash).toEqual({});
    expect(wireCardRim(decoded, "Brute Strength")).toBeNull();
  });

  it("omits the key entirely when card rims are off and no rim is worn", () => {
    signIn();
    mockCosmetics = [
      row({
        heroId: "king-kong",
        cards: [{ key: "brute strength", tier: 3 }],
        tokenRim: { unlockedTier: 4, enabled: false, selectedTier: null },
        cardRims: { enabled: false, selectedTier: null },
      }),
    ];
    const { hook, ws } = boot();
    act(() => hook.result.current.joinRoom("R1", "king-kong"));

    expect(frame(ws, "JOIN_ROOM")).not.toHaveProperty("cosmetics");
  });

  it("publishes IDS ONLY — never a URL, inline data, or a card title", () => {
    signIn();
    equip();
    const { hook, ws } = boot();
    act(() => hook.result.current.createRoom("king-kong"));

    const { cosmetics } = frame(ws, "CREATE_ROOM");
    expect(cosmetics).toMatch(/^[0-9a-z;,]+$/);
    expect(cosmetics).not.toMatch(/https?:|data:|\.png|\.webp|brute/i);
    expect(Buffer.byteLength(cosmetics, "utf8")).toBeLessThanOrEqual(512);
  });

  it("omits the key for a hero with nothing equipped", () => {
    signIn();
    equip();
    const { hook, ws } = boot();
    act(() => hook.result.current.createRoom("baba-yaga"));

    expect(frame(ws, "CREATE_ROOM")).not.toHaveProperty("cosmetics");
  });

  it("omits it for a guest even with a loadout still in the store", () => {
    // Guest play is untouched BY CONSTRUCTION: useCosmetics only probes once the
    // account probe says signed-in, and a stale store must not leak either.
    equip();
    const { hook, ws } = boot();
    act(() => hook.result.current.createRoom("king-kong"));
    act(() => hook.result.current.joinRoom("R1", "king-kong"));

    expect(frame(ws, "CREATE_ROOM")).not.toHaveProperty("cosmetics");
    expect(frame(ws, "JOIN_ROOM")).not.toHaveProperty("cosmetics");
  });

  it("keeps cosmetics off RECONNECT — the server kept the seat and its blob", () => {
    signIn();
    equip();
    const { hook, ws } = boot();
    act(() => hook.result.current.joinRoom("R1", "king-kong"));
    act(() => ws.emit({ type: "ROOM_JOINED", roomId: "R1", token: "tok", you: "p1" }));

    act(() => hook.result.current.joinRoom("R1", ""));
    expect(frame(ws, "RECONNECT")).not.toHaveProperty("cosmetics");
  });
});

describe("useProSocket — slow mode pacing (issue #703)", () => {
  const realWS = global.WebSocket;
  beforeEach(() => {
    // @ts-expect-error — swap in the fake for the test
    global.WebSocket = FakeWebSocket;
    window.localStorage.clear();
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
    global.WebSocket = realWS;
    FakeWebSocket.last = null;
  });

  /** An opponent action batch, tagged so the order snapshots land in is readable. */
  const oppState = (tag: string, over: Record<string, unknown> = {}) => ({
    type: "STATE",
    view: { you: "p1", prompt: null, activePlayer: "p2", winner: null, tag, ...over },
    legalActions: [],
    events: [{ type: "ACTION_SPENT", player: "p2", action: "MANEUVER" }],
  });

  /** A batch caused by the viewer. */
  const ownState = (tag: string) => ({
    type: "STATE",
    view: { you: "p1", prompt: null, activePlayer: "p1", winner: null, tag },
    legalActions: [],
    events: [{ type: "ACTION_SPENT", player: "p1", action: "ATTACK" }],
  });

  /**
   * Boot into a game, recording EVERY distinct snapshot the hook hands React.
   * That list is the acceptance bar: the activity log diffs consecutive
   * snapshots, so a paced session must deliver exactly the same ones, in the
   * same order, as an unpaced one — never a collapsed pair.
   */
  const boot = (slowMode: boolean) => {
    const seen: string[] = [];
    // `last` is tracked separately from the array so the join-view reset below
    // can clear what was recorded without un-deduping the render after it.
    let last: string | undefined;
    const hook = renderHook(
      ({ slow }: { slow: boolean }) => {
        const r = useProSocket("ws://test", false, slow);
        const tag = (r.snapshot?.view as { tag?: string } | undefined)?.tag;
        if (tag && last !== tag) { last = tag; seen.push(tag); }
        return r;
      },
      { initialProps: { slow: slowMode } }
    );
    const ws = FakeWebSocket.last!;
    act(() => ws.open());
    act(() => ws.emit(roomJoined()));
    // The join's own STATE — the authoritative first view every (re)connection
    // gets. It is the ONE broadcast allowed to bypass the queue, so consume it
    // here and let each test start from a settled, live game.
    act(() =>
      ws.emit({
        type: "STATE",
        view: { you: "p1", prompt: null, activePlayer: "p2", winner: null, tag: "join" },
        legalActions: [],
        events: [{ type: "TURN_STARTED", player: "p2", turnNumber: 1 }],
      })
    );
    seen.length = 0;
    return { hook, ws, seen };
  };

  /** Let the one-snapshot-per-tick drain finish. */
  const settle = () => {
    for (let i = 0; i < 20; i += 1) act(() => void jest.advanceTimersByTime(1));
  };

  it("is completely inert with slow mode OFF — every batch applies as it lands", () => {
    const { hook, ws, seen } = boot(false);
    act(() => ws.emit(oppState("a")));
    act(() => ws.emit(oppState("b")));
    act(() => ws.emit(oppState("c")));

    expect(seen).toEqual(["a", "b", "c"]);
    expect(hook.result.current.slowModeHeld).toBeNull();
    expect(hook.result.current.slowModePending).toBe(0);
  });

  it("applies one opponent action at a time, advancing on OK", () => {
    const { hook, ws, seen } = boot(true);
    act(() => ws.emit(oppState("a")));
    act(() => ws.emit(oppState("b")));
    act(() => ws.emit(oppState("c")));

    expect(seen).toEqual(["a"]);
    expect(hook.result.current.slowModeHeld).not.toBeNull();
    expect(hook.result.current.slowModePending).toBe(2);

    act(() => hook.result.current.advanceSlowMode());
    expect(seen).toEqual(["a", "b"]);
    expect(hook.result.current.slowModePending).toBe(1);

    act(() => hook.result.current.advanceSlowMode());
    expect(seen).toEqual(["a", "b", "c"]);
    expect(hook.result.current.slowModeHeld).not.toBeNull();

    act(() => hook.result.current.advanceSlowMode());
    expect(hook.result.current.slowModeHeld).toBeNull();
  });

  it("'Skip all' drains the backlog one render each, so the log still sees every batch", () => {
    const { hook, ws, seen } = boot(true);
    act(() => ws.emit(oppState("a")));
    act(() => ws.emit(oppState("b")));
    act(() => ws.emit(oppState("c")));

    act(() => hook.result.current.skipSlowMode());
    settle();

    expect(seen).toEqual(["a", "b", "c"]);
    expect(hook.result.current.slowModeHeld).toBeNull();
    expect(hook.result.current.slowModePending).toBe(0);
  });

  it("flushes the queue before the viewer's own action, in arrival order", () => {
    const { hook, ws, seen } = boot(true);
    act(() => ws.emit(oppState("a")));
    act(() => ws.emit(oppState("b")));

    act(() => hook.result.current.sendAction({ type: "END_TURN", player: "p1" } as never));
    act(() => ws.emit(ownState("mine")));
    settle();

    expect(seen).toEqual(["a", "b", "mine"]);
    expect(hook.result.current.slowModeHeld).toBeNull();
  });

  it("never delays a prompt aimed at the viewer (defense mid-combat)", () => {
    const { hook, ws, seen } = boot(true);
    act(() => ws.emit(oppState("a")));
    act(() => ws.emit(oppState("b")));

    act(() =>
      ws.emit(
        oppState("defend", {
          prompt: { promptId: "d1", player: "p1", kind: "COMMIT_DEFENSE", options: [] },
        })
      )
    );
    settle();

    expect(seen).toEqual(["a", "b", "defend"]);
    expect(hook.result.current.slowModeHeld).toBeNull();
    expect(hook.result.current.slowModePending).toBe(0);
  });

  it("flushes when the toggle is switched off mid-queue", () => {
    const { hook, ws, seen } = boot(true);
    act(() => ws.emit(oppState("a")));
    act(() => ws.emit(oppState("b")));
    act(() => ws.emit(oppState("c")));
    expect(seen).toEqual(["a"]);

    act(() => hook.rerender({ slow: false }));
    settle();

    expect(seen).toEqual(["a", "b", "c"]);
    expect(hook.result.current.slowModeHeld).toBeNull();
  });

  it("flushes when the game ends, so the result is never stuck behind a spotlight", () => {
    const { hook, ws, seen } = boot(true);
    act(() => ws.emit(oppState("a")));
    act(() => ws.emit(oppState("b")));
    act(() => ws.emit(oppState("over", { winner: "p2" })));
    settle();

    expect(seen).toEqual(["a", "b", "over"]);
    expect(hook.result.current.slowModeHeld).toBeNull();
  });

  it("bypasses the queue for a reconnection's own first view", () => {
    const { hook, ws, seen } = boot(true);
    act(() => ws.emit(oppState("a")));
    act(() => ws.emit(oppState("b")));
    // A socket re-open is what marks the next STATE as authoritative — not the
    // absence of events. Re-fire onopen to stand in for the reconnect.
    act(() => ws.open());
    act(() =>
      ws.emit({
        type: "STATE",
        view: { you: "p1", prompt: null, activePlayer: "p2", winner: null, tag: "resume" },
        legalActions: [],
      })
    );
    settle();

    expect(seen).toEqual(["a", "b", "resume"]);
    expect(hook.result.current.slowModeHeld).toBeNull();
  });

  it("does NOT flush on a mid-game events-less broadcast (an accepted undo)", () => {
    // Regression (#703 follow-up): the engine's `applyUndo` clears lastEvents and
    // rebroadcasts, so a rewind is a mid-game STATE with an empty batch. Reading
    // that as "must be a reconnection" flushed the queue and tore the spotlight
    // off screen with no input from the player.
    const { hook, ws, seen } = boot(true);
    act(() => ws.emit(oppState("a")));
    act(() => ws.emit(oppState("b")));
    act(() =>
      ws.emit({
        type: "STATE",
        view: { you: "p1", prompt: null, activePlayer: "p2", winner: null, tag: "rewind" },
        legalActions: [],
      })
    );
    settle();

    expect(seen).toEqual(["a"]); // still on the batch the player is reading
    expect(hook.result.current.slowModeHeld).not.toBeNull();
    expect(hook.result.current.slowModePending).toBe(2);

    // …and it never costs the player an OK of its own: the next acknowledgement
    // shows `b`, and the one after pulls the silent rewind through and ends,
    // rather than parking a "nothing visible changed" panel in the way.
    act(() => hook.result.current.advanceSlowMode());
    settle();
    expect(seen).toEqual(["a", "b"]);
    expect(hook.result.current.slowModeHeld?.view).toMatchObject({ tag: "b" });

    act(() => hook.result.current.advanceSlowMode());
    settle();
    expect(seen).toEqual(["a", "b", "rewind"]);
    expect(hook.result.current.slowModeHeld).toBeNull();
  });

  it("holds the SAME batch on screen when the cap overflows behind it", () => {
    // The self-dismiss bug. A busy bot turn outruns a reading player; past the cap
    // the oldest batches apply to keep the board moving — but what is HELD must
    // not change, or the panel silently repaints with an action nobody chose.
    const { hook, ws, seen } = boot(true);
    act(() => ws.emit(oppState("first")));
    for (let i = 0; i < 14; i += 1) act(() => ws.emit(oppState(`b${i}`)));
    settle();

    expect(hook.result.current.slowModeHeld?.view).toMatchObject({ tag: "first" });
    // …and the overflow really did apply, in order, behind the panel.
    expect(seen.slice(0, 5)).toEqual(["first", "b0", "b1", "b2", "b3"]);
  });

  it("drops the in-flight latch on ERROR, so a rejected action can't flush later", () => {
    const { hook, ws, seen } = boot(true);
    act(() => hook.result.current.sendAction({ type: "END_TURN", player: "p1" } as never));
    act(() => ws.emit({ type: "ERROR", code: "ILLEGAL_ACTION", message: "nope" }));
    act(() => ws.emit(oppState("theirs")));
    settle();

    expect(seen).toEqual(["theirs"]);
    expect(hook.result.current.slowModeHeld).not.toBeNull(); // paced, not flushed
  });
});

// ---------------------------------------------------------------------------
// Reconnect-on-resume: an iPhone Safari tab backgrounded or locked mid-match
// (the App Switcher, the lock button, a phone call). Chrome kills the socket
// and freezes the page's own JS — `setTimeout`, `ws.onclose`'s exponential
// backoff included — so nothing on the page can retry on its own no matter how
// long the phone sits locked. The only reliable signal a suspended tab gets on
// return is `visibilitychange`/`focus`/`pageshow`, which is what these tests
// drive instead of the fake clock (advancing the fake clock models time a
// running page actually experienced — a frozen tab experiences none of it,
// which is the whole bug).
// ---------------------------------------------------------------------------

describe("useProSocket — reconnect on resume (iOS Safari suspend/resume)", () => {
  const realWS = global.WebSocket;

  // jsdom's `document.hidden` is a read-only getter on the prototype; override
  // it with a mutable backing value, same idiom as useLobbyMatchCue.test.tsx.
  let hiddenFlag = false;
  beforeAll(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hiddenFlag });
  });

  beforeEach(() => {
    // @ts-expect-error — swap in the fake for the test
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

  const bootIntoGame = () => {
    const hook = renderHook(() => useProSocket("ws://test"));
    const ws = FakeWebSocket.last!;
    act(() => ws.open());
    act(() => ws.emit(roomJoined()));
    act(() => ws.emit(minimalState()));
    return { hook, ws };
  };

  it("a dead socket reconnects the instant the tab returns — no waiting out the backoff timer", () => {
    // Full jitter (issue #209): random=0.5 → a 500ms delay is scheduled. On a
    // real phone that timer is exactly what a freeze can strand forever; here
    // we simply never advance the fake clock through it, which is the honest
    // model of "the page never got to run while the tab was suspended" —
    // whether that suspension lasted 30 seconds or 20 minutes makes no
    // difference to a timer that never fires at all.
    jest.useFakeTimers();
    const randSpy = jest.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      const { ws } = bootIntoGame();
      const before = FakeWebSocket.instances;
      act(() => ws.close()); // the phone's OS tears the socket down while backgrounded

      backgroundThenReturn();

      // A fresh socket exists synchronously — the return itself was the retry,
      // not the (never-advanced, possibly-frozen) 500ms backoff timer.
      expect(FakeWebSocket.instances).toBe(before + 1);
      const next = FakeWebSocket.last!;
      expect(next).not.toBe(ws);

      // …and the original backoff timer was actually cancelled, not merely
      // raced: advancing well past its 500ms delay must not spawn a THIRD
      // socket behind the one already open.
      act(() => jest.advanceTimersByTime(2000));
      expect(FakeWebSocket.instances).toBe(before + 1);
    } finally {
      randSpy.mockRestore();
    }
  });

  it("covers a short (<1 min), a medium (~5 min) and a long (~20 min) absence identically", () => {
    // The fix has no notion of "how long" — a frozen timer never fires
    // regardless of duration, so the return path is the same whether the
    // phone was locked for 45 seconds or 20 minutes. This just exercises the
    // same recovery three times back to back to nail that down.
    jest.useFakeTimers();
    try {
      let { hook, ws } = bootIntoGame();
      for (const _absence of ["short", "medium", "long"]) {
        const before = FakeWebSocket.instances;
        act(() => ws.close());
        backgroundThenReturn();
        expect(FakeWebSocket.instances).toBe(before + 1);
        ws = FakeWebSocket.last!;
        act(() => ws.open());
        act(() => ws.emit(roomJoined()));
        act(() => ws.emit(minimalState()));
        expect(hook.result.current.status).toBe("open");
        expect(hook.result.current.gameLost).toBe(false);
      }
    } finally {
      jest.useRealTimers();
    }
  });

  it("a socket that LOOKS open on return is treated with suspicion: a fresh RECONNECT verifies it", () => {
    // The other half of the fear: a phone that silently drops the transport
    // without ever firing `close`, leaving `status` stuck reporting "open" for
    // a connection that's actually dead. The fix can't tell the difference
    // from inside the page, so it asks the server for a fresh STATE on return
    // — the identical trick p2p #848 already uses for a stale view — which
    // both fixes the silently-dead case and is a harmless no-op for a
    // genuinely fine one.
    const { hook, ws } = bootIntoGame();
    expect(ws.sentTypes.filter((t) => t === "RECONNECT")).toHaveLength(0);
    const before = FakeWebSocket.instances;

    backgroundThenReturn();

    expect(ws.sentTypes.filter((t) => t === "RECONNECT")).toHaveLength(1);
    expect(hook.result.current.resyncing).toBe(true);
    // No new transport — this is a resync on the SAME socket, not a reconnect.
    expect(FakeWebSocket.instances).toBe(before);

    // The server answers exactly as a live RECONNECT always does; the board
    // never shows a loss for what was only a verification round-trip.
    act(() => ws.emit(roomJoined()));
    act(() => ws.emit(minimalState()));
    expect(hook.result.current.resyncing).toBe(false);
    expect(hook.result.current.gameLost).toBe(false);
  });

  it("never verifies an open socket before the game has actually started (nothing to resync yet)", () => {
    // Pre-game / lobby wait: `hadStateRef` is still false, so a tab-return here
    // must not fire a RECONNECT the server has no room-with-a-seat to answer.
    const hook = renderHook(() => useProSocket("ws://test"));
    const ws = FakeWebSocket.last!;
    act(() => ws.open());
    act(() =>
      ws.emit({ type: "ROOM_CREATED", roomId: "R1", token: "tok", you: "p1", formatId: "duel", seats: ["p1"], requiredPlayers: 2 })
    );

    backgroundThenReturn();

    expect(ws.sentTypes.filter((t) => t === "RECONNECT")).toHaveLength(0);
    expect(hook.result.current.resyncing).toBe(false);
  });

  it("does not spam RECONNECT for a rapid flurry of app-switches (shares #848's cooldown)", () => {
    jest.useFakeTimers();
    try {
      const { ws } = bootIntoGame();
      backgroundThenReturn();
      expect(ws.sentTypes.filter((t) => t === "RECONNECT")).toHaveLength(1);

      // Same STATE never landed yet (server hasn't answered) and the player
      // flicks back to the app and away again inside the cooldown window.
      act(() => jest.advanceTimersByTime(RESYNC_COOLDOWN_MS - 1));
      backgroundThenReturn();
      expect(ws.sentTypes.filter((t) => t === "RECONNECT")).toHaveLength(1);

      // Once the cooldown has actually elapsed, a further return may verify again.
      act(() => jest.advanceTimersByTime(2));
      backgroundThenReturn();
      expect(ws.sentTypes.filter((t) => t === "RECONNECT")).toHaveLength(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it.each(["focus", "pageshow"])(
    "`%s` retries a dead socket just like `visibilitychange` (belt-and-braces)",
    (eventName) => {
      jest.useFakeTimers();
      try {
        const { ws } = bootIntoGame();
        const before = FakeWebSocket.instances;
        act(() => ws.close());
        act(() => window.dispatchEvent(new Event(eventName)));
        expect(FakeWebSocket.instances).toBe(before + 1);
      } finally {
        jest.useRealTimers();
      }
    }
  );

  it("two resume signals firing together (visibilitychange + focus) never open a second socket", () => {
    jest.useFakeTimers();
    try {
      const { ws } = bootIntoGame();
      const before = FakeWebSocket.instances;
      act(() => ws.close());
      act(() => {
        hiddenFlag = false;
        document.dispatchEvent(new Event("visibilitychange"));
        window.dispatchEvent(new Event("focus"));
      });
      // The second signal finds the first socket already CONNECTING and backs off.
      expect(FakeWebSocket.instances).toBe(before + 1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("re-arms a stale SERVER_RESTARTING resume deadline fresh on return — a long freeze must not eat the whole budget", () => {
    // issue #133's RESUME_DEADLINE_MS is deliberately generous so a slow-but-ok
    // resume never reads as a loss. But the countdown is a plain `setTimeout`
    // armed the moment SERVER_RESTARTING is processed — if the tab freezes
    // moments later, the ENTIRE budget elapses while the page cannot even
    // attempt a reconnect, and whatever's left (nothing) is what the returning
    // player actually gets. The fix re-arms a fresh RESUME_DEADLINE_MS the
    // moment the player is actually back and able to retry.
    jest.useFakeTimers();
    try {
      const { hook, ws } = bootIntoGame();
      act(() => ws.emit({ type: "SERVER_RESTARTING" }));
      expect(hook.result.current.serverRestarting).toBe(true);

      // Most of the original deadline is already "spent" by the time the
      // player returns (the freeze itself, standing in for the locked phone).
      act(() => jest.advanceTimersByTime(RESUME_DEADLINE_MS - 100));
      expect(hook.result.current.gameLost).toBe(false);

      backgroundThenReturn(); // re-arms a fresh RESUME_DEADLINE_MS from here

      // Advancing PAST where the ORIGINAL deadline would have fired (total
      // elapsed since SERVER_RESTARTING is now over RESUME_DEADLINE_MS) must
      // NOT declare the game lost — the stale timer was cancelled, not merely
      // outraced.
      act(() => jest.advanceTimersByTime(200));
      expect(hook.result.current.gameLost).toBe(false);

      // The fresh deadline still protects against a game that truly never
      // comes back — advance it the rest of the way out.
      act(() => jest.advanceTimersByTime(RESUME_DEADLINE_MS));
      expect(hook.result.current.gameLost).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it("a slow first STATE after a resume-triggered reconnect never trips the loss screen early", () => {
    // The resume itself may take a beat (a fresh TCP/WS handshake, a server
    // under load) — that is a slow resume, not a failed one, and #133's
    // contract is explicit: only a fired deadline with nothing behind it is a
    // loss. This nails down that the resume-on-visibility path honors the
    // exact same contract as the ordinary redeploy path.
    jest.useFakeTimers();
    const randSpy = jest.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      const { hook, ws } = bootIntoGame();
      act(() => ws.emit({ type: "SERVER_RESTARTING" }));
      act(() => ws.close());

      backgroundThenReturn(); // reconnects immediately, re-arms the deadline

      const next = FakeWebSocket.last!;
      expect(next).not.toBe(ws);
      // The new socket takes its time to actually open and answer — well
      // inside the freshly re-armed deadline — and the player must see no
      // loss screen for any of it.
      act(() => jest.advanceTimersByTime(RESUME_DEADLINE_MS - 1000));
      expect(hook.result.current.gameLost).toBe(false);

      act(() => next.open());
      act(() => next.emit(roomJoined()));
      act(() => next.emit(minimalState()));
      expect(hook.result.current.gameLost).toBe(false);
      expect(hook.result.current.serverRestarting).toBe(false);
      expect(hook.result.current.snapshot).not.toBeNull();
    } finally {
      randSpy.mockRestore();
      jest.useRealTimers();
    }
  });

  it("resets the backoff attempt counter on a resume reconnect — a returning player retries at full speed", () => {
    // Without a reset, a phone that had already grown its backoff toward
    // MAX_RETRY_DELAY_MS before being backgrounded would carry that inflated
    // delay into every retry AFTER the resume-triggered one too, for no
    // reason the player caused. Grow the backoff first, then confirm the
    // reconnect a SECOND close schedules (post-resume) is back to the
    // shortest delay.
    jest.useFakeTimers();
    const randSpy = jest.spyOn(Math, "random").mockReturnValue(1); // no jitter shrinkage — exact cap
    try {
      const { ws } = bootIntoGame();
      // Grow the backoff: several closes in a row without ever reopening.
      act(() => ws.close());
      act(() => jest.advanceTimersByTime(1000)); // attempts: 0 → 1, delay was capped(1000·2^0)=1000
      const second = FakeWebSocket.last!;
      act(() => second.close());
      act(() => jest.advanceTimersByTime(2000)); // attempts: 1 → 2, delay was capped(1000·2^1)=2000
      const third = FakeWebSocket.last!;

      const before = FakeWebSocket.instances;
      act(() => third.close()); // attempts now 3 — next backoff would be capped(1000·2^2)=4000
      backgroundThenReturn(); // resume reconnects immediately AND resets attempts to 0
      expect(FakeWebSocket.instances).toBe(before + 1);
      const fourth = FakeWebSocket.last!;

      // Close the resumed socket: if attempts had carried over, the next
      // scheduled delay would be capped(1000·2^3)=8000; reset, it's back to
      // capped(1000·2^0)=1000 — advancing exactly 1000ms must reconnect.
      act(() => fourth.close());
      act(() => jest.advanceTimersByTime(999));
      expect(FakeWebSocket.instances).toBe(before + 1);
      act(() => jest.advanceTimersByTime(1));
      expect(FakeWebSocket.instances).toBe(before + 2);
    } finally {
      randSpy.mockRestore();
      jest.useRealTimers();
    }
  });
});
