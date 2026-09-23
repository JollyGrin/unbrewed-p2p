import { describe, expect, test } from "vitest";
import { constantTimeEqual, signTicket, verifyTicket } from "./ticket";

const SECRET = "test-secret";
const CLAIMS = { room: "HFB9", pid: "p1", name: "Player", role: "player" as const };

describe("signTicket / verifyTicket", () => {
  test("verifies a freshly signed ticket", async () => {
    const ticket = await signTicket(CLAIMS, SECRET);

    const result = await verifyTicket(ticket, SECRET);

    expect(result.ok).toBe(true);
    expect(result.ok && result.payload).toMatchObject(CLAIMS);
  });

  test("rejects a ticket signed with a different secret", async () => {
    const ticket = await signTicket(CLAIMS, SECRET);

    const result = await verifyTicket(ticket, "wrong-secret");

    expect(result).toEqual({ ok: false, reason: "signature" });
  });

  test("rejects a tampered payload", async () => {
    const ticket = await signTicket(CLAIMS, SECRET);
    const [body, signature] = ticket.split(".");
    const tamperedPayload = JSON.stringify({ ...CLAIMS, room: "OTHER", exp: 9999999999 });
    const tamperedBody = Buffer.from(tamperedPayload).toString("base64url");

    const result = await verifyTicket(`${tamperedBody}.${signature}`, SECRET);

    expect(result).toEqual({ ok: false, reason: "signature" });
  });

  test("rejects an expired ticket", async () => {
    const now = 1_000_000_000_000;
    const ticket = await signTicket(CLAIMS, SECRET, now);

    const result = await verifyTicket(ticket, SECRET, now + 9 * 60 * 60 * 1000);

    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  test("rejects a malformed ticket", async () => {
    expect(await verifyTicket("not-a-ticket", SECRET)).toEqual({ ok: false, reason: "malformed" });
    expect(await verifyTicket("", SECRET)).toEqual({ ok: false, reason: "malformed" });
  });

  test("a verified ticket carries the room it was signed for", async () => {
    const ticket = await signTicket({ ...CLAIMS, room: "ZZZZ" }, SECRET);

    const result = await verifyTicket(ticket, SECRET);

    expect(result.ok && result.payload.room).toBe("ZZZZ");
  });
});

describe("constantTimeEqual", () => {
  test("returns true for identical strings", () => {
    expect(constantTimeEqual("friends", "friends")).toBe(true);
  });

  test("returns false for different strings of the same length", () => {
    expect(constantTimeEqual("friendz", "friends")).toBe(false);
  });

  test("returns false for different lengths", () => {
    expect(constantTimeEqual("friend", "friends")).toBe(false);
  });
});
