import { describe, expect, test } from "vitest";
import { handleJoin } from "./join";
import { verifyTicket } from "./ticket";

const ENV = { VOICE_PASSWORD: "friends", TICKET_SECRET: "test-secret" };
const BODY = { room: "HFB9", name: "Player", password: "friends", role: "player" };

function postJson(body: unknown): Request {
  return new Request("https://voice.example/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("handleJoin", () => {
  test("returns a ticket and participant id for a correct password", async () => {
    const response = await handleJoin(postJson(BODY), { env: ENV, createParticipantId: () => "p1" });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { ticket: string; participantId: string };
    expect(payload).toEqual({ ticket: expect.any(String), participantId: "p1" });

    const verified = await verifyTicket(payload.ticket, ENV.TICKET_SECRET);
    expect(verified).toEqual({
      ok: true,
      payload: { room: "HFB9", pid: "p1", name: "Player", role: "player", exp: expect.any(Number) },
    });
  });

  test("rejects a wrong password with 401", async () => {
    const response = await handleJoin(postJson({ ...BODY, password: "wrong" }), {
      env: ENV,
      createParticipantId: () => "p1",
    });

    expect(response.status).toBe(401);
  });

  test("rejects an invalid body with 400", async () => {
    const response = await handleJoin(postJson({ ...BODY, room: "../x" }), {
      env: ENV,
      createParticipantId: () => "p1",
    });

    expect(response.status).toBe(400);
  });

  test("rejects malformed JSON with 400", async () => {
    const request = new Request("https://voice.example/join", { method: "POST", body: "not json" });

    const response = await handleJoin(request, { env: ENV, createParticipantId: () => "p1" });

    expect(response.status).toBe(400);
  });

  test("answers 503 without leaking which secret is missing", async () => {
    const response = await handleJoin(postJson(BODY), {
      env: { VOICE_PASSWORD: "friends" },
      createParticipantId: () => "p1",
    });

    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("TICKET_SECRET");
  });
});
