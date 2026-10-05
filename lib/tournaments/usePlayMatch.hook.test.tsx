/**
 * The Play button's api calls (#1218 review): one press = one recorded ready,
 * a CREATE is always a recorded `POST …/ready` (settled rule 6), and a poll
 * that gives up reloads the match.
 */
import { StrictMode } from "react";
import { act, renderHook } from "@testing-library/react";

import { freshGrant, MAX_POLLS, playErrorMessage, POLL_MS, usePlayMatch } from "./usePlayMatch";
import type { MatchDetail, TicketGrant } from "./types";
import * as api from "./api";

const push = jest.fn(async () => true);
jest.mock("next/router", () => ({ useRouter: () => ({ push }) }));
jest.mock("./api", () => ({ getMatchTicket: jest.fn(), readyForMatch: jest.fn(), getMatch: jest.fn() }));

const ready = api.readyForMatch as jest.Mock;
const ticket = api.getMatchTicket as jest.Mock;
const getMatch = api.getMatch as jest.Mock;

const grant = (over: Partial<TicketGrant>): { ok: true; value: TicketGrant } => ({
  ok: true,
  value: { action: "create", ticket: "t", gameIndex: 0, slot: "a", heroId: null, map: null, ticketExpiresAt: "x", roomId: null, ...over },
});

beforeEach(() => {
  push.mockClear();
  ready.mockReset();
  ticket.mockReset();
  getMatch.mockReset().mockResolvedValue({ ok: false, reason: "unavailable" });
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

  it("never records a second ready-check while MY room for the match is live (#1233 review)", async () => {
    const NOW = Date.parse("2026-10-05T12:00:00Z");
    const later = new Date(NOW + 10 * 60_000).toISOString();
    ticket.mockResolvedValue(grant({ action: "create", slot: "a" }));
    const detail = (over: Partial<MatchDetail>): { ok: true; value: MatchDetail } => ({
      ok: true,
      value: { match: { slotA: "eA", slotB: "eB" }, readyChecks: [], liveRoom: null, ...over } as unknown as MatchDetail,
    });
    // The room is open (liveRoom) …
    getMatch.mockResolvedValueOnce(detail({ liveRoom: { gameIndex: 0, roomId: "MINE", readyEntryId: "eA", expiresAt: later } }));
    expect(await freshGrant("s", "m", () => NOW)).toEqual({ ok: false, reason: "conflict", code: "seat_held" });
    // … or still opening (a live create check, no room id yet).
    getMatch.mockResolvedValueOnce(
      detail({ readyChecks: [{ id: "rc", gameIndex: 0, entryId: "eA", createdAt: "", expiresAt: later, roomId: null, outcome: "pending", role: "create" }] }),
    );
    expect(await freshGrant("s", "m", () => NOW)).toMatchObject({ ok: false, code: "seat_held" });
    expect(ready).not.toHaveBeenCalled();
    // The opponent's stale opening room (grace ran out) is no hold of mine: create.
    ready.mockResolvedValue(grant({ action: "create", ticket: "recorded" }));
    getMatch.mockResolvedValueOnce(
      detail({ readyChecks: [{ id: "rc", gameIndex: 0, entryId: "eB", createdAt: "", expiresAt: later, roomId: null, outcome: "pending", role: "create" }] }),
    );
    expect(await freshGrant("s", "m", () => NOW)).toEqual(grant({ action: "create", ticket: "recorded" }));
  });

  it("a reload at the hero picker (liveRoomOnly): my pending check with no room is no held seat; a live room still is", async () => {
    const NOW = Date.parse("2026-10-05T12:00:00Z");
    const later = new Date(NOW + 10 * 60_000).toISOString();
    ticket.mockResolvedValue(grant({ action: "create", slot: "a" }));
    ready.mockResolvedValue(grant({ action: "create", ticket: "recorded" }));
    const detail = (over: Partial<MatchDetail>): { ok: true; value: MatchDetail } => ({
      ok: true,
      value: { match: { slotA: "eA", slotB: "eB" }, readyChecks: [], liveRoom: null, ...over } as unknown as MatchDetail,
    });
    getMatch.mockResolvedValueOnce(
      detail({ readyChecks: [{ id: "rc", gameIndex: 0, entryId: "eA", createdAt: "", expiresAt: later, roomId: null, outcome: "pending", role: "create" }] }),
    );
    expect(await freshGrant("s", "m", () => NOW, { liveRoomOnly: true })).toEqual(grant({ action: "create", ticket: "recorded" }));
    getMatch.mockResolvedValueOnce(detail({ liveRoom: { gameIndex: 0, roomId: "MINE", readyEntryId: "eA", expiresAt: later } }));
    expect(await freshGrant("s", "m", () => NOW, { liveRoomOnly: true })).toMatchObject({ ok: false, code: "seat_held" });
  });

  it("explains the held seat", () => {
    expect(playErrorMessage({ ok: false, reason: "conflict", code: "seat_held" })).toMatch(/another tab or device/);
  });
});

describe("usePlayMatch stale-tab guard (#1248)", () => {
  const NOW = Date.now();
  const later = new Date(NOW + 10 * 60_000).toISOString();
  const held = (roomId: string | null) => ({
    ok: true,
    value: { match: { slotA: "eA", slotB: "eB" }, readyChecks: [], liveRoom: { gameIndex: 0, roomId, readyEntryId: "eA", expiresAt: later } } as unknown as MatchDetail,
  });

  it("with my own live seat, Play never POSTs /ready — twice", async () => {
    ticket.mockResolvedValue(grant({ action: "create", slot: "a" }));
    getMatch.mockResolvedValue(held("MINE"));
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

  it("a live create check with no room id falls back to the remembered tournament room", async () => {
    window.localStorage.setItem("unbrewed-pro-tournament-room-REMEM", JSON.stringify({ slug: "s", matchId: "m", ts: Date.now() }));
    ticket.mockResolvedValue(grant({ action: "create", slot: "a" }));
    getMatch.mockResolvedValue(held(null));
    const { result } = renderHook(() => usePlayMatch("s", "m"));
    await act(async () => result.current.play());
    expect(result.current.phase).toEqual({ kind: "seat_held", roomId: "REMEM" });
    expect(ready).not.toHaveBeenCalled();
  });

  it("the api's {decision:'seat_held', roomId} answer lands in the same phase", async () => {
    ready.mockResolvedValue({ ok: false, reason: "conflict", code: "seat_held", roomId: "APIROOM" });
    const { result } = renderHook(() => usePlayMatch("s", "m"));
    await act(async () => result.current.play());
    expect(result.current.phase).toEqual({ kind: "seat_held", roomId: "APIROOM" });
    expect(push).not.toHaveBeenCalled();
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
