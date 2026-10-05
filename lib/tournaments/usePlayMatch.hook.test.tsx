/**
 * The Play button's api calls (#1218 review): one press = one recorded ready,
 * a CREATE is always a recorded `POST …/ready` (settled rule 6), and a poll
 * that gives up reloads the match.
 */
import { act, renderHook } from "@testing-library/react";

import { freshGrant, MAX_POLLS, POLL_MS, usePlayMatch } from "./usePlayMatch";
import type { TicketGrant } from "./types";
import * as api from "./api";

const push = jest.fn(async () => true);
jest.mock("next/router", () => ({ useRouter: () => ({ push }) }));
jest.mock("./api", () => ({ getMatchTicket: jest.fn(), readyForMatch: jest.fn() }));

const ready = api.readyForMatch as jest.Mock;
const ticket = api.getMatchTicket as jest.Mock;

const grant = (over: Partial<TicketGrant>): { ok: true; value: TicketGrant } => ({
  ok: true,
  value: { action: "create", ticket: "t", gameIndex: 0, slot: "a", heroId: null, map: null, ticketExpiresAt: "x", roomId: null, ...over },
});

beforeEach(() => {
  push.mockClear();
  ready.mockReset();
  ticket.mockReset();
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
});

describe("usePlayMatch", () => {
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
