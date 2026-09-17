import { describe, expect, test } from "@jest/globals";
import { parseRosterMessage } from "./voiceRoster";

const TRACK = { sessionId: "s1", trackName: "mic", location: "remote" as const };
const PARTICIPANT = { pid: "p1", name: "Player", role: "player" as const, muted: false, track: TRACK };

describe("parseRosterMessage", () => {
  test("parses a well-formed roster object", () => {
    const result = parseRosterMessage({ type: "roster", participants: [PARTICIPANT] });

    expect(result).toEqual([PARTICIPANT]);
  });

  test("parses a well-formed roster JSON string", () => {
    const result = parseRosterMessage(JSON.stringify({ type: "roster", participants: [PARTICIPANT] }));

    expect(result).toEqual([PARTICIPANT]);
  });

  test("accepts a participant with no track", () => {
    const result = parseRosterMessage({ type: "roster", participants: [{ ...PARTICIPANT, track: null }] });

    expect(result).toEqual([{ ...PARTICIPANT, track: null }]);
  });

  test.each([
    ["invalid JSON string", "not json"],
    ["not an object", 42],
    ["wrong message type", { type: "other", participants: [] }],
    ["participants not an array", { type: "roster", participants: "nope" }],
    ["a participant missing a field", { type: "roster", participants: [{ pid: "p1" }] }],
    ["a participant with an invalid role", { type: "roster", participants: [{ ...PARTICIPANT, role: "admin" }] }],
    ["a participant with a malformed track", { type: "roster", participants: [{ ...PARTICIPANT, track: { sessionId: "s1" } }] }],
  ])("returns null for %s", (_label, data) => {
    expect(parseRosterMessage(data)).toBeNull();
  });
});
