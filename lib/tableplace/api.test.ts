import { describe, expect, it, jest } from "@jest/globals";
import { createLobby, retryCopy, validateLobby } from "./api";
import type { LobbyRequest } from "./types";

const BODY = { version: 1 } as LobbyRequest;

/** jsdom has no `Response`: just the parts `post` reads. */
const fakeResponse = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  json: async () =>
    typeof body === "string" ? JSON.parse(body) : (body as object),
});

const respond = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  jest.fn(async () =>
    fakeResponse(status, body, headers),
  ) as unknown as typeof fetch;

describe("table.place api", () => {
  it("POSTs to /v1/lobbies/validate without a lobby name", async () => {
    const f = respond(200, {
      valid: true,
      provisioned: false,
      ttl_seconds: 14400,
    });
    const r = await validateLobby(BODY, f);
    expect(r.ok).toBe(true);
    const [url, init] = (f as unknown as jest.Mock).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.table.place/v1/lobbies/validate");
    expect(JSON.parse(init.body as string)).not.toHaveProperty("lobby");
  });

  it("returns the seats on a 201", async () => {
    const seats = [{ seat: 0, url: "https://table.place/play?lobby=a&seat=0" }];
    const r = await createLobby(BODY, respond(201, { lobby: "a", seats }));
    expect(r).toEqual({ ok: true, data: { lobby: "a", seats } });
  });

  it("shows the API's own message on a 400, with no retry copy", async () => {
    const message = "Pack 'x' (seat 0) is missing deck slot 'deck'.";
    const r = await createLobby(
      BODY,
      respond(400, { error: "missing_deck_slot", message }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatchObject({
      code: "missing_deck_slot",
      message,
      retryable: false,
    });
    expect(retryCopy(r.error)).toBeNull();
  });

  it("reads Retry-After on a 429", async () => {
    const r = await createLobby(
      BODY,
      respond(429, {
        error: "rate_limited",
        message: "Slow down.",
        details: { retry_after_seconds: 30 },
      }),
    );
    if (r.ok) throw new Error("expected a failure");
    expect(r.error.retryAfterSeconds).toBe(30);
    expect(retryCopy(r.error)).toBe(
      "table.place is busy. Try again in 30 seconds.",
    );
  });

  it("falls back to the header, and to minutes for long waits", async () => {
    const r = await createLobby(
      BODY,
      respond(
        429,
        { error: "rate_limited", message: "Slow down." },
        { "retry-after": "600" },
      ),
    );
    if (r.ok) throw new Error("expected a failure");
    expect(retryCopy(r.error)).toBe(
      "table.place is busy. Try again in 10 minutes.",
    );
  });

  it("offers a retry on a 5xx, even without a JSON body", async () => {
    const f = respond(502, "bad gateway");
    const r = await createLobby(BODY, f);
    if (r.ok) throw new Error("expected a failure");
    expect(r.error.retryable).toBe(true);
    expect(r.error.message).toBe("table.place answered 502.");
    expect(retryCopy(r.error)).toMatch(/problem on its side/);
  });

  it("survives a network failure", async () => {
    const f = jest.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    const r = await validateLobby(BODY, f);
    if (r.ok) throw new Error("expected a failure");
    expect(r.error.code).toBe("network");
    expect(retryCopy(r.error)).toMatch(/back online/);
  });
});
