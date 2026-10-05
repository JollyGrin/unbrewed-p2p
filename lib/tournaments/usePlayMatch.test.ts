/** Ready → ticket → /pro/game link, and the copy for a refused ready (#1218). */
import { grantHref, playErrorMessage } from "./usePlayMatch";
import type { TicketGrant } from "./types";

const GRANT: TicketGrant = {
  action: "create",
  ticket: "p.s",
  gameIndex: 0,
  slot: "a",
  heroId: "kenshiro",
  map: { kind: "catalog", id: "counts-castle" },
  ticketExpiresAt: "2026-10-05T12:15:00Z",
  roomId: null,
};

describe("grantHref", () => {
  it("create → a /pro/game ticket link with no room", () => {
    const q = new URL(grantHref(GRANT, "s", "m2-1")!, "http://x").searchParams;
    expect(q.get("ticket")).toBe("p.s");
    expect(q.get("lockHero")).toBe("kenshiro");
    expect(q.get("lockMap")).toBe("catalog:counts-castle");
    expect(q.has("room")).toBe(false);
  });

  it("join → the room to join", () => {
    const q = new URL(grantHref({ ...GRANT, action: "join", roomId: "ABCD" }, "s", "m")!, "http://x").searchParams;
    expect(q.get("room")).toBe("ABCD");
  });

  it("join with the other room still opening → nothing yet (poll)", () => {
    expect(grantHref({ ...GRANT, action: "join", roomId: null }, "s", "m")).toBeNull();
  });
});

it("says why a ready was refused", () => {
  expect(playErrorMessage({ ok: false, reason: "forbidden", code: "not_in_match" })).toMatch(/two players/);
  expect(playErrorMessage({ ok: false, reason: "conflict", code: "match_in_play" })).toMatch(/already in play/);
  expect(playErrorMessage({ ok: false, reason: "conflict", code: "match_not_open", message: "the match is decided" })).toMatch(/decided/);
  expect(playErrorMessage({ ok: false, reason: "unavailable", code: "tournaments_disabled" })).toMatch(/aren't available/);
  expect(playErrorMessage({ ok: false, reason: "unauthorized" })).toMatch(/Sign in/);
});
