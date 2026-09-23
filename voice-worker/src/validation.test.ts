import { describe, expect, test } from "vitest";
import { parseJoinRequest } from "./validation";

const VALID_BODY = { room: "HFB9", name: "Player", password: "friends", role: "player" };

describe("parseJoinRequest", () => {
  test("accepts a well-formed player request", () => {
    expect(parseJoinRequest(VALID_BODY)).toEqual({ ok: true, value: VALID_BODY });
  });

  test("defaults an unknown role to spectator", () => {
    const result = parseJoinRequest({ ...VALID_BODY, role: "admin" });

    expect(result.ok && result.value.role).toBe("spectator");
  });

  test("trims the display name", () => {
    const result = parseJoinRequest({ ...VALID_BODY, name: "  Player  " });

    expect(result.ok && result.value.name).toBe("Player");
  });

  test.each([
    ["body is not an object", null],
    ["room id has illegal characters", { ...VALID_BODY, room: "../etc" }],
    ["room id is too long", { ...VALID_BODY, room: "A".repeat(33) }],
    ["password missing", { ...VALID_BODY, password: undefined }],
    ["password too long", { ...VALID_BODY, password: "x".repeat(129) }],
    ["name is empty", { ...VALID_BODY, name: "   " }],
    ["name is too long", { ...VALID_BODY, name: "x".repeat(33) }],
  ])("rejects when %s", (_label, body) => {
    expect(parseJoinRequest(body).ok).toBe(false);
  });
});
