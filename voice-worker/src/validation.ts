/**
 * unbrewed-voice — request validation for POST /join.
 * Pure and framework-free so it can be unit tested without touching the Worker runtime.
 */
export type VoiceRole = "player" | "spectator";

export type JoinRequest = {
  room: string;
  name: string;
  password: string;
  role: VoiceRole;
};

export type ParseResult = { ok: true; value: JoinRequest } | { ok: false; error: string };

const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const MAX_NAME_LENGTH = 32;
const MAX_PASSWORD_LENGTH = 128;

const isString = (value: unknown): value is string => typeof value === "string";

export function parseJoinRequest(body: unknown): ParseResult {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid request body" };
  const raw = body as Record<string, unknown>;

  if (!isString(raw.room) || !ROOM_ID_PATTERN.test(raw.room)) {
    return { ok: false, error: "Invalid room id" };
  }
  if (!isString(raw.password) || raw.password.length === 0 || raw.password.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, error: "Password is required" };
  }
  const name = isString(raw.name) ? raw.name.trim() : "";
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
    return { ok: false, error: `Name must be 1-${MAX_NAME_LENGTH} characters` };
  }

  return {
    ok: true,
    value: {
      room: raw.room,
      name,
      password: raw.password,
      role: raw.role === "player" ? "player" : "spectator",
    },
  };
}
