/**
 * The ready path's dead ends (p2p #1250 LV-2), replayed against a fake api that
 * runs the api's own rule (feature/tournaments-api src/tournaments/readyCheck.ts
 * decideReady, ported verbatim below) over one in-memory match.
 */
import { act, renderHook } from "@testing-library/react";

import { readyDecision, ROOM_OPEN_GRACE_MS, usePlayMatch } from "./usePlayMatch";
import type { MatchDetail, ReadyCheck, TicketGrant } from "./types";
import * as api from "./api";

const push = jest.fn(async () => true);
jest.mock("next/router", () => ({ useRouter: () => ({ push }) }));
jest.mock("./api", () => ({ getMatchTicket: jest.fn(), readyForMatch: jest.fn(), getMatch: jest.fn() }));

// --- the api's rule, as written there ---------------------------------------
type Decision = { kind: "create" } | { kind: "join"; roomId: string | null } | { kind: "seat_held"; roomId: string | null };
const isLive = (c: ReadyCheck, now: number) => c.outcome === "pending" && Date.parse(c.expiresAt) > now;
const newestLiveCreate = (checks: ReadyCheck[], entryId: string | null, now: number) =>
  checks
    .filter((c) => (entryId === null || c.entryId === entryId) && c.gameIndex === 0 && c.role === "create" && isLive(c, now))
    .sort((x, y) => Date.parse(y.createdAt) - Date.parse(x.createdAt))[0];
function decideReady(checks: ReadyCheck[], opponent: string, now: number, self: string): Decision {
  const newest = newestLiveCreate(checks, null, now);
  const own = newest?.entryId === self ? newest : undefined;
  if (own && own.roomId !== null) return { kind: "seat_held", roomId: own.roomId };
  const theirs = newestLiveCreate(checks, opponent, now);
  const decision: Decision =
    !theirs || (theirs.roomId === null && now - Date.parse(theirs.createdAt) >= ROOM_OPEN_GRACE_MS)
      ? { kind: "create" }
      : { kind: "join", roomId: theirs.roomId };
  if (own && decision.kind === "create") return { kind: "seat_held", roomId: null };
  return decision;
}

// --- the fake api: f is slot a (entry eF), h is slot b (entry eH) ----------
let now = Date.parse("2026-10-05T12:00:00Z");
let checks: ReadyCheck[] = [];
let caller: "f" | "h" = "f";
const entry = (p: "f" | "h") => (p === "f" ? "eF" : "eH");
const grantFor = (d: Decision, n: number): { ok: true; value: TicketGrant } => ({
  ok: true,
  value: {
    action: d.kind === "seat_held" ? (d.roomId === null ? "create" : "join") : d.kind,
    decision: d.kind,
    ticket: `ticket-${caller}-${n}`,
    gameIndex: 0,
    slot: caller === "f" ? "a" : "b",
    heroId: null,
    map: null,
    ticketExpiresAt: new Date(now + 15 * 60_000).toISOString(),
    roomId: d.kind === "create" ? null : d.roomId,
  },
});
const decide = () => decideReady(checks, entry(caller === "f" ? "h" : "f"), now, entry(caller));
let n = 0;
const ready = () => {
  const d = decide();
  if (d.kind !== "seat_held") {
    checks.push({
      id: `rc${++n}`,
      gameIndex: 0,
      entryId: entry(caller),
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 15 * 60_000).toISOString(),
      roomId: d.kind === "join" ? d.roomId : null,
      outcome: "pending",
      role: d.kind,
    });
  }
  return grantFor(d, ++n);
};
/** The engine reports the room open: room_opened stamps every live check. */
const roomOpened = (roomId: string) => {
  checks = checks.map((c) => (isLive(c, now) && c.roomId === null ? { ...c, roomId } : c));
};
const detail = (): { ok: true; value: MatchDetail } => ({
  ok: true,
  value: { match: { slotA: "eF", slotB: "eH" }, readyChecks: checks, liveRoom: null } as unknown as MatchDetail,
});

beforeEach(() => {
  push.mockClear();
  now = Date.parse("2026-10-05T12:00:00Z");
  checks = [];
  n = 0;
  jest.spyOn(Date, "now").mockImplementation(() => now);
  (api.readyForMatch as jest.Mock).mockImplementation(async () => ready());
  (api.getMatchTicket as jest.Mock).mockImplementation(async () => grantFor(decide(), ++n));
  (api.getMatch as jest.Mock).mockImplementation(async () => detail());
});
afterEach(() => jest.restoreAllMocks());

const pressAs = async (who: "f" | "h") => {
  caller = who;
  push.mockClear();
  const { result } = renderHook(() => usePlayMatch("s", "m"));
  await act(async () => result.current.play());
  return result;
};
const pushedQuery = () => new URL(String((push.mock.calls as unknown[][])[0][0]), "http://x").searchParams;

it("LV-2: f's own create is pending (via the API, never connected); h creates ZHQB after the grace; f's 'Join now' joins ZHQB", async () => {
  caller = "f";
  ready(); // f: POST /ready via the API, never connects
  now += ROOM_OPEN_GRACE_MS + 1000;
  await pressAs("h"); // h presses ready in the UI → create
  expect(pushedQuery().has("room")).toBe(false);
  roomOpened("ZHQB"); // h's room opens (and stamps f's older check too)

  const f = await pressAs("f");
  expect(f.current.phase.kind).not.toBe("seat_held");
  expect(pushedQuery().get("room")).toBe("ZHQB");
  expect(pushedQuery().get("ticket")).toMatch(/^ticket-f-/);
});

it("LV-2: f's own pending create with NO room yet opens f's room from the UI (api: seat_held, roomId null)", async () => {
  caller = "f";
  ready(); // via the API, no room opened
  now += 5 * 60_000;
  const before = checks.length;
  const f = await pressAs("f");
  expect(f.current.phase.kind).not.toBe("seat_held");
  expect(pushedQuery().has("room")).toBe(false); // a CREATE: f opens their own room
  expect(checks).toHaveLength(before); // never a second create check
});

it("f's own room open and newest: the seat-held card, nothing recorded", async () => {
  caller = "f";
  ready();
  roomOpened("MYRM");
  const before = checks.length;
  const f = await pressAs("f");
  expect(f.current.phase).toEqual({ kind: "seat_held", roomId: "MYRM" });
  expect(push).not.toHaveBeenCalled();
  expect(checks).toHaveLength(before);
});

it("readyDecision is the api rule on the page's ready-checks, case for case", () => {
  const at = (who: "f" | "h") => readyDecision(detail().value, who === "f" ? "a" : "b", 0, now);
  const both = (who: "f" | "h") => {
    caller = who;
    expect(at(who)).toEqual(decide());
  };
  both("f"); // nothing: create
  caller = "f";
  ready();
  both("f"); // own opening: seat_held null
  both("h"); // opponent's opening, inside grace: join null
  now += ROOM_OPEN_GRACE_MS;
  both("h"); // grace ran out: create
  caller = "h";
  ready();
  roomOpened("ZHQB");
  both("f"); // the opponent's newer room: join ZHQB (not seat_held)
  both("h"); // h's own newest: seat_held ZHQB
});
