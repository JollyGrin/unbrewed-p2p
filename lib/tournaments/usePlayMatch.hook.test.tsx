/**
 * The Play button's api calls (#1218 review): one press = one recorded ready,
 * a CREATE is always a recorded `POST …/ready` (settled rule 6), and a poll
 * that gives up reloads the match.
 */
import { StrictMode } from "react";
import { act, renderHook } from "@testing-library/react";

import {
  freshGrant,
  grantAvoiding,
  MAX_POLLS,
  PLAY_TIMEOUT_MESSAGE,
  playErrorMessage,
  POLL_MS,
  reportDeadRoom,
  roomReleaseWaitMs,
  ROOM_GONE_MIN_AGE_MS,
  usePlayMatch,
} from "./usePlayMatch";
import type { MatchDetail, TicketGrant } from "./types";
import * as api from "./api";

const push = jest.fn(async () => true);
jest.mock("next/router", () => ({ useRouter: () => ({ push }) }));
jest.mock("./api", () => ({ getMatchTicket: jest.fn(), readyForMatch: jest.fn(), getMatch: jest.fn(), reportRoomGone: jest.fn() }));

const ready = api.readyForMatch as jest.Mock;
const ticket = api.getMatchTicket as jest.Mock;
const getMatch = api.getMatch as jest.Mock;
const roomGone = api.reportRoomGone as jest.Mock;

const grant = (over: Partial<TicketGrant>): { ok: true; value: TicketGrant } => ({
  ok: true,
  value: { action: "create", ticket: "t", gameIndex: 0, slot: "a", heroId: null, map: null, ticketExpiresAt: "x", roomId: null, ...over },
});

beforeEach(() => {
  push.mockClear();
  ready.mockReset();
  ticket.mockReset();
  getMatch.mockReset().mockResolvedValue({ ok: false, reason: "unavailable" });
  roomGone.mockReset();
  window.localStorage.clear();
});

describe("freshGrant", () => {
  it("a join (room known or still opening) is the GET's answer — nothing recorded", async () => {
    ticket.mockResolvedValue(grant({ action: "join", roomId: "R1" }));
    expect(await freshGrant("s", "m")).toEqual(grant({ action: "join", roomId: "R1" }));
    expect(ready).not.toHaveBeenCalled();
  });

  it("a create is always re-asked with POST …/ready, which records the check", async () => {
    ticket.mockResolvedValue(grant({ action: "create", ticket: "unrecorded" }));
    ready.mockResolvedValue(grant({ action: "create", ticket: "recorded" }));
    expect(await freshGrant("s", "m")).toEqual(grant({ action: "create", ticket: "recorded" }));
    expect(ready).toHaveBeenCalledTimes(1);
  });

  it("the api's seat_held is its own answer — a join back into my room, or my opening room's create ticket — nothing recorded (p2p #1250)", async () => {
    ticket.mockResolvedValueOnce(grant({ action: "join", decision: "seat_held", roomId: "MINE", ticket: "back" }));
    expect(await freshGrant("s", "m")).toEqual(grant({ action: "join", decision: "seat_held", roomId: "MINE", ticket: "back" }));
    ticket.mockResolvedValueOnce(grant({ action: "create", decision: "seat_held", roomId: null, ticket: "finish" }));
    expect(await freshGrant("s", "m")).toEqual(grant({ action: "create", decision: "seat_held", roomId: null, ticket: "finish" }));
    expect(ready).not.toHaveBeenCalled();
    expect(getMatch).not.toHaveBeenCalled(); // the api decides, not a client guess
  });

  it("explains the held seat", () => {
    expect(playErrorMessage({ ok: false, reason: "conflict", code: "seat_held" })).toMatch(/another tab or device/);
  });
});

describe("dead-room recovery (#1268, contract item 2)", () => {
  it("reportDeadRoom posts room-gone; only a 404 (an api without the route) is legacy", async () => {
    roomGone.mockResolvedValueOnce({ ok: true, value: { cleared: true } });
    expect(await reportDeadRoom("s", "m", "GONE")).toBe("reported");
    expect(roomGone).toHaveBeenCalledWith("s", "m", "GONE");
    roomGone.mockResolvedValueOnce({ ok: true, value: { cleared: false } });
    expect(await reportDeadRoom("s", "m", "GONE")).toBe("reported");
    // p2p #1269: a network blip is not an answer (the screen asks again next press).
    roomGone.mockResolvedValueOnce({ ok: false, reason: "unavailable" });
    expect(await reportDeadRoom("s", "m", "GONE")).toBe("unavailable");
    roomGone.mockResolvedValueOnce({ ok: true, value: { cleared: false, reason: "too_soon" } });
    expect(await reportDeadRoom("s", "m", "GONE")).toBe("too_soon");
    roomGone.mockResolvedValueOnce({ ok: true, value: { cleared: false, reason: "not_room_creator" } });
    expect(await reportDeadRoom("s", "m", "GONE")).toBe("reported");
    roomGone.mockResolvedValueOnce({ ok: false, reason: "not_found" });
    expect(await reportDeadRoom("s", "m", "GONE")).toBe("legacy");
  });

  it("grantAvoiding: a cleared room's next answer is a recorded create", async () => {
    ticket.mockResolvedValue(grant({ action: "create", ticket: "unrecorded" }));
    ready.mockResolvedValue(grant({ action: "create", ticket: "recorded" }));
    expect(await grantAvoiding("s", "m", "GONE")).toEqual(grant({ action: "create", ticket: "recorded" }));
  });

  it("grantAvoiding refuses any answer that still points into the dead room", async () => {
    ticket.mockResolvedValueOnce(grant({ action: "join", roomId: "GONE" }));
    expect(await grantAvoiding("s", "m", "GONE")).toEqual({ ok: false, reason: "room_still_gone" });
    ticket.mockResolvedValueOnce(grant({ action: "join", decision: "seat_held", roomId: "GONE" }));
    expect(await grantAvoiding("s", "m", "GONE")).toEqual({ ok: false, reason: "room_still_gone" });
    ticket.mockResolvedValueOnce({ ok: false, reason: "conflict", code: "seat_held", roomId: "GONE" });
    expect(await grantAvoiding("s", "m", "GONE")).toEqual({ ok: false, reason: "room_still_gone" });
    // another room is a fine answer
    ticket.mockResolvedValueOnce(grant({ action: "join", roomId: "NEW" }));
    expect(await grantAvoiding("s", "m", "GONE")).toEqual(grant({ action: "join", roomId: "NEW" }));
  });
});

describe("usePlayMatch stale-tab guard (#1248, rule = the api's decideReady since p2p #1250)", () => {
  const NOW = Date.now();
  const later = new Date(NOW + 10 * 60_000).toISOString();
  const check = (entryId: string, roomId: string | null, ageMs: number) => ({
    id: `${entryId}-${ageMs}`,
    gameIndex: 0,
    entryId,
    createdAt: new Date(NOW - ageMs).toISOString(),
    expiresAt: later,
    roomId,
    outcome: "pending",
    role: "create",
  });
  const detail = (readyChecks: unknown[]) => ({
    ok: true,
    value: { match: { slotA: "eA", slotB: "eB" }, readyChecks, liveRoom: null } as unknown as MatchDetail,
  });

  it("with my own room open (newest live create, the api agrees), Play never POSTs /ready — twice", async () => {
    ticket.mockResolvedValue(grant({ action: "join", decision: "seat_held", slot: "a", roomId: "MINE" }));
    getMatch.mockResolvedValue(detail([check("eA", "MINE", 1000)]));
    const reload = jest.fn();
    const { result } = renderHook(() => usePlayMatch("s", "m", reload));
    await act(async () => result.current.play());
    expect(result.current.phase).toEqual({ kind: "seat_held", roomId: "MINE" });
    await act(async () => result.current.play());
    expect(ready).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    // The retry re-reads the match and unlocks Play.
    reload.mockClear();
    act(() => result.current.retry());
    expect(reload).toHaveBeenCalledTimes(1);
    expect(result.current.phase.kind).toBe("idle");
  });

  it("an older api (no decision) still short-circuits on the client rule", async () => {
    ticket.mockResolvedValue(grant({ action: "create", slot: "a" }));
    getMatch.mockResolvedValue(detail([check("eA", "MINE", 1000)]));
    const { result } = renderHook(() => usePlayMatch("s", "m"));
    await act(async () => result.current.play());
    expect(result.current.phase).toEqual({ kind: "seat_held", roomId: "MINE" });
    expect(ready).not.toHaveBeenCalled();
  });

  it("the client rule and the api disagree → the api decides via POST /ready", async () => {
    ticket.mockResolvedValue(grant({ action: "join", decision: "join", slot: "a", roomId: "THEIRS" }));
    getMatch.mockResolvedValue(detail([check("eA", "MINE", 1000)])); // a stale page
    ready.mockResolvedValue(grant({ action: "join", decision: "join", roomId: "THEIRS", ticket: "j" }));
    const { result } = renderHook(() => usePlayMatch("s", "m"));
    await act(async () => result.current.play());
    expect(ready).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(expect.stringContaining("room=THEIRS"));
  });

  it("my own create still opening (no room) opens it from the UI with the api's create ticket", async () => {
    ticket.mockResolvedValue(grant({ action: "create", decision: "seat_held", slot: "a", roomId: null, ticket: "finish" }));
    getMatch.mockResolvedValue(detail([check("eA", null, 5 * 60_000)]));
    ready.mockResolvedValue(grant({ action: "create", decision: "seat_held", roomId: null, ticket: "finish" }));
    const { result } = renderHook(() => usePlayMatch("s", "m"));
    await act(async () => result.current.play());
    expect(push).toHaveBeenCalledWith(expect.stringContaining("ticket=finish"));
    expect(push).not.toHaveBeenCalledWith(expect.stringContaining("room="));
  });

  it("the api's 200 {decision:'seat_held', roomId} from POST /ready lands in the seat-held phase", async () => {
    ready.mockResolvedValue(grant({ action: "join", decision: "seat_held", roomId: "APIROOM" }));
    const { result } = renderHook(() => usePlayMatch("s", "m"));
    await act(async () => result.current.play());
    expect(result.current.phase).toEqual({ kind: "seat_held", roomId: "APIROOM" });
    expect(push).not.toHaveBeenCalled();
  });

  it("a 409 seat_held (older api) still lands there too", async () => {
    ready.mockResolvedValue({ ok: false, reason: "conflict", code: "seat_held", roomId: "APIROOM" });
    const { result } = renderHook(() => usePlayMatch("s", "m"));
    await act(async () => result.current.play());
    expect(result.current.phase).toEqual({ kind: "seat_held", roomId: "APIROOM" });
  });

  it("Back to your room carries a fresh join ticket (p2p #1250 LV-3)", async () => {
    ticket.mockResolvedValue(grant({ action: "join", decision: "seat_held", roomId: "DQJ6", ticket: "fresh", heroId: "alice" }));
    const { result } = renderHook(() => usePlayMatch("s", "m"));
    await act(async () => result.current.backToRoom("DQJ6"));
    const u = new URL(String((push.mock.calls as unknown[][])[0][0]), "http://x");
    const q = u.searchParams;
    expect(q.get("room")).toBe("DQJ6");
    expect(new URLSearchParams(u.hash.slice(1)).get("ticket")).toBe("fresh");
    expect(q.get("lockHero")).toBe("alice");
    expect(ready).not.toHaveBeenCalled();
  });

  it("Back to your room with no ticket to be had falls back to the plain room link", async () => {
    ticket.mockResolvedValue({ ok: false, reason: "unavailable" });
    const { result } = renderHook(() => usePlayMatch("s", "m"));
    await act(async () => result.current.backToRoom("DQJ6"));
    expect(push).toHaveBeenCalledWith("/pro/game?room=DQJ6");
  });
});

describe("usePlayMatch", () => {
  it("navigates under StrictMode's mount → unmount → remount (dev, #1230)", async () => {
    ready.mockResolvedValue(grant({ action: "create", ticket: "strict" }));
    const { result } = renderHook(() => usePlayMatch("s", "m"), { wrapper: StrictMode });
    await act(async () => result.current.play());
    expect(ready).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(expect.stringContaining("ticket=strict"));
    expect(result.current.phase.kind).toBe("busy"); // locked while navigating
  });

  it("a double click records ONE ready-check", async () => {
    let resolve!: (v: unknown) => void;
    ready.mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = renderHook(() => usePlayMatch("s", "m"));
    await act(async () => {
      void result.current.play();
      void result.current.play();
    });
    await act(async () => resolve(grant({ action: "create" })));
    expect(ready).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("a press after a failure is allowed again", async () => {
    ready.mockResolvedValueOnce({ ok: false, reason: "unavailable" }).mockResolvedValueOnce(grant({ action: "create" }));
    const { result } = renderHook(() => usePlayMatch("s", "m"));
    await act(async () => result.current.play());
    expect(result.current.phase.kind).toBe("error");
    await act(async () => result.current.play());
    expect(ready).toHaveBeenCalledTimes(2);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("while the other room opens it polls; a turn to create goes through POST …/ready", async () => {
    jest.useFakeTimers();
    try {
      ready.mockResolvedValueOnce(grant({ action: "join", roomId: null })).mockResolvedValueOnce(grant({ action: "create", ticket: "mine" }));
      ticket.mockResolvedValue(grant({ action: "create", ticket: "unrecorded" })); // grace ran out
      const { result } = renderHook(() => usePlayMatch("s", "m"));
      await act(async () => void result.current.play());
      expect(result.current.phase.kind).toBe("opening");
      await act(async () => jest.advanceTimersByTimeAsync(POLL_MS));
      expect(ready).toHaveBeenCalledTimes(2);
      expect(push).toHaveBeenCalledWith(expect.stringContaining("ticket=mine"));
      expect(push).not.toHaveBeenCalledWith(expect.stringContaining("unrecorded"));
    } finally {
      jest.useRealTimers();
    }
  });

  it("when the poll gives up it says so and reloads the match", async () => {
    jest.useFakeTimers();
    try {
      ready.mockResolvedValue(grant({ action: "join", roomId: null }));
      ticket.mockResolvedValue(grant({ action: "join", roomId: null }));
      const reload = jest.fn();
      const { result } = renderHook(() => usePlayMatch("s", "m", reload));
      await act(async () => void result.current.play());
      await act(async () => jest.advanceTimersByTimeAsync(POLL_MS * (MAX_POLLS + 1)));
      expect(result.current.phase).toEqual({ kind: "error", message: "The other room didn't open. Try again." });
      expect(reload).toHaveBeenCalledTimes(1);
      expect(push).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("p2p #1269", () => {
  it("a write that timed out says it may have gone through, never 'Couldn't reach the server'", () => {
    const r = { ok: false as const, reason: "unavailable" as const, code: "timeout", message: "x" };
    expect(playErrorMessage(r)).toBe(PLAY_TIMEOUT_MESSAGE);
    expect(PLAY_TIMEOUT_MESSAGE).toMatch(/may still have gone through: check the match page/);
    expect(playErrorMessage({ ok: false, reason: "unavailable" })).toBe("Couldn't reach the server. Try again.");
  });

  it("roomReleaseWaitMs: the rest of the 30s gate from the room's create check (+1s), bounded", () => {
    const now = Date.parse("2026-10-07T12:00:00Z");
    const d = (agoMs: number, roomId = "GONE", role = "create") =>
      ({
        match: { slotA: "e1", slotB: "e2" },
        readyChecks: [{ entryId: "e1", roomId, role, createdAt: new Date(now - agoMs).toISOString() }],
      }) as never;
    expect(roomReleaseWaitMs(d(10_000), "GONE", now)).toBe(21_000);
    expect(roomReleaseWaitMs(d(60_000), "GONE", now)).toBe(1_000);
    expect(roomReleaseWaitMs(d(-60_000), "GONE", now)).toBe(ROOM_GONE_MIN_AGE_MS + 1_000); // a skewed future check
    expect(roomReleaseWaitMs(d(10_000, "OTHER"), "GONE", now)).toBe(ROOM_GONE_MIN_AGE_MS + 1_000);
    expect(roomReleaseWaitMs(d(10_000, "GONE", "join"), "GONE", now)).toBe(ROOM_GONE_MIN_AGE_MS + 1_000);
    expect(roomReleaseWaitMs(null, "GONE", now)).toBe(ROOM_GONE_MIN_AGE_MS + 1_000);
  });
});
