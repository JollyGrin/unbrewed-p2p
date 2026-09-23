import { describe, expect, test } from "@jest/globals";
import { voiceRoomSocketUrl } from "./voiceSocketUrl";

describe("voiceRoomSocketUrl", () => {
  test("turns https into wss and encodes the room and ticket", () => {
    const url = voiceRoomSocketUrl("https://voice.example.workers.dev", "HFB9", "a.b");

    expect(url).toBe("wss://voice.example.workers.dev/rooms/HFB9/ws?ticket=a.b");
  });

  test("turns http into ws for local dev", () => {
    const url = voiceRoomSocketUrl("http://localhost:8787", "HFB9", "a.b");

    expect(url).toBe("ws://localhost:8787/rooms/HFB9/ws?ticket=a.b");
  });

  test("encodes special characters in the room id and ticket", () => {
    const url = voiceRoomSocketUrl("https://voice.example", "room a", "sig/with+chars");

    expect(url).toBe("wss://voice.example/rooms/room%20a/ws?ticket=sig%2Fwith%2Bchars");
  });
});
