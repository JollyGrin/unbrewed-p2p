import { describe, expect, test } from "@jest/globals";
import { diffRemoteTracks, remoteParticipantsWithTracks } from "./rosterTracks";
import type { Participant } from "./voiceRoster";

const track = (sessionId: string) => ({ sessionId, trackName: "mic", location: "remote" as const });

const me: Participant = { pid: "me", name: "Me", role: "player", muted: false, track: track("me-session") };
const alice: Participant = { pid: "alice", name: "Alice", role: "player", muted: false, track: track("a1") };
const bob: Participant = { pid: "bob", name: "Bob", role: "spectator", muted: true, track: null };

describe("remoteParticipantsWithTracks", () => {
  test("excludes me and participants without a track", () => {
    expect(remoteParticipantsWithTracks([me, alice, bob], "me")).toEqual([alice]);
  });

  test("returns an empty list when nobody else has a track", () => {
    expect(remoteParticipantsWithTracks([me, bob], "me")).toEqual([]);
  });
});

describe("diffRemoteTracks", () => {
  test("pulls a newly-tracked remote participant", () => {
    const result = diffRemoteTracks(new Set(), [me, alice], "me");

    expect(result).toEqual({ toPull: [alice], toDrop: [] });
  });

  test("does not re-pull a participant already pulled", () => {
    const result = diffRemoteTracks(new Set(["alice"]), [me, alice], "me");

    expect(result).toEqual({ toPull: [], toDrop: [] });
  });

  test("drops a participant who left the roster", () => {
    const result = diffRemoteTracks(new Set(["alice"]), [me], "me");

    expect(result).toEqual({ toPull: [], toDrop: ["alice"] });
  });

  test("drops a participant whose track was cleared", () => {
    const withoutTrack: Participant = { ...alice, track: null };

    const result = diffRemoteTracks(new Set(["alice"]), [me, withoutTrack], "me");

    expect(result).toEqual({ toPull: [], toDrop: ["alice"] });
  });

  test("an unrelated roster change (mute) triggers neither a pull nor a drop", () => {
    const alicesMuted: Participant = { ...alice, muted: true };

    const result = diffRemoteTracks(new Set(["alice"]), [me, alicesMuted], "me");

    expect(result).toEqual({ toPull: [], toDrop: [] });
  });

  test("handles a simultaneous pull and drop", () => {
    const result = diffRemoteTracks(new Set(["bob"]), [me, alice], "me");

    expect(result).toEqual({ toPull: [alice], toDrop: ["bob"] });
  });
});
