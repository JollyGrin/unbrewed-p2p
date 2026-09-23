import { describe, expect, test } from "@jest/globals";
import { voiceContextFromRoute } from "./voiceRoute";

describe("voiceContextFromRoute", () => {
  test("a pro game with a room id is a player context", () => {
    const result = voiceContextFromRoute("/pro/game", { room: "HFB9" });

    expect(result).toEqual({ roomId: "HFB9", role: "player" });
  });

  test("the voice page is a spectator context", () => {
    const result = voiceContextFromRoute("/voice", { room: "HFB9" });

    expect(result).toEqual({ roomId: "HFB9", role: "spectator" });
  });

  test("returns null without a room id", () => {
    expect(voiceContextFromRoute("/pro/game", {})).toBeNull();
  });

  test("returns null on unrelated pages", () => {
    expect(voiceContextFromRoute("/bag", { room: "HFB9" })).toBeNull();
  });

  test("uses the first value when the query param repeats", () => {
    const result = voiceContextFromRoute("/pro/game", { room: ["HFB9", "XXXX"] });

    expect(result?.roomId).toBe("HFB9");
  });
});
