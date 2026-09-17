import { afterEach, describe, expect, jest, test } from "@jest/globals";
import { joinVoice } from "./joinVoice";

const VOICE_URL = "https://voice.example.workers.dev";
const REQUEST = { room: "HFB9", name: "Player", password: "friends", role: "player" as const };

function mockFetch(status: number, body: unknown) {
  const fn = jest.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }));
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("joinVoice", () => {
  test("posts to <voiceUrl>/join and returns the ticket", async () => {
    const fetchFn = mockFetch(200, { ticket: "a.b", participantId: "p1" });

    const result = await joinVoice(VOICE_URL, REQUEST);

    expect(result).toEqual({ ok: true, ticket: { ticket: "a.b", participantId: "p1" } });
    expect(fetchFn).toHaveBeenCalledWith(
      `${VOICE_URL}/join`,
      expect.objectContaining({ method: "POST", body: JSON.stringify(REQUEST) }),
    );
  });

  test("returns not-configured without calling fetch when voiceUrl is empty", async () => {
    const fetchFn = mockFetch(200, {});

    const result = await joinVoice("", REQUEST);

    expect(result).toEqual({ ok: false, reason: "not-configured", message: "Voice chat isn't set up yet" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test("maps 401 to a wrong-password error", async () => {
    mockFetch(401, { error: "Wrong password" });

    const result = await joinVoice(VOICE_URL, REQUEST);

    expect(result).toEqual({ ok: false, reason: "wrong-password", message: "Wrong password" });
  });

  test("maps 503 to not-configured", async () => {
    mockFetch(503, { error: "x" });

    const result = await joinVoice(VOICE_URL, REQUEST);

    expect(result.ok === false && result.reason).toBe("not-configured");
  });

  test("maps a network failure to an error result", async () => {
    global.fetch = jest.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;

    const result = await joinVoice(VOICE_URL, REQUEST);

    expect(result.ok === false && result.reason).toBe("network");
  });

  test("treats a malformed success body as a server error", async () => {
    mockFetch(200, { ticket: 42 });

    const result = await joinVoice(VOICE_URL, REQUEST);

    expect(result.ok === false && result.reason).toBe("server");
  });
});
