import { describe, expect, test } from "vitest";
import { applyRosterAction, EMPTY_ROSTER, type RosterState } from "./roster";

describe("applyRosterAction", () => {
  test("join adds a new participant with no track and unmuted", () => {
    const next = applyRosterAction(EMPTY_ROSTER, { type: "join", pid: "p1", name: "Player", role: "player" });

    expect(next.participants).toEqual([{ pid: "p1", name: "Player", role: "player", muted: false, track: null }]);
  });

  test("join with an existing pid replaces the old seat instead of duplicating it", () => {
    const withOne: RosterState = { participants: [{ pid: "p1", name: "Old", role: "spectator", muted: true, track: null }] };

    const next = applyRosterAction(withOne, { type: "join", pid: "p1", name: "New", role: "player" });

    expect(next.participants).toEqual([{ pid: "p1", name: "New", role: "player", muted: false, track: null }]);
  });

  test("leave removes the participant", () => {
    const withTwo: RosterState = {
      participants: [
        { pid: "p1", name: "A", role: "player", muted: false, track: null },
        { pid: "p2", name: "B", role: "spectator", muted: false, track: null },
      ],
    };

    const next = applyRosterAction(withTwo, { type: "leave", pid: "p1" });

    expect(next.participants.map((p) => p.pid)).toEqual(["p2"]);
  });

  test("leave on an unknown pid is a no-op", () => {
    const next = applyRosterAction(EMPTY_ROSTER, { type: "leave", pid: "ghost" });

    expect(next.participants).toEqual([]);
  });

  test("publish sets the track for the matching participant only", () => {
    const state: RosterState = {
      participants: [
        { pid: "p1", name: "A", role: "player", muted: false, track: null },
        { pid: "p2", name: "B", role: "player", muted: false, track: null },
      ],
    };
    const track = { sessionId: "s1", trackName: "mic", location: "remote" as const };

    const next = applyRosterAction(state, { type: "publish", pid: "p1", track });

    expect(next.participants.find((p) => p.pid === "p1")?.track).toEqual(track);
    expect(next.participants.find((p) => p.pid === "p2")?.track).toBeNull();
  });

  test("publish with a null track clears it", () => {
    const track = { sessionId: "s1", trackName: "mic", location: "remote" as const };
    const state: RosterState = { participants: [{ pid: "p1", name: "A", role: "player", muted: false, track }] };

    const next = applyRosterAction(state, { type: "publish", pid: "p1", track: null });

    expect(next.participants[0].track).toBeNull();
  });

  test("mute flips the muted flag for the matching participant only", () => {
    const state: RosterState = {
      participants: [
        { pid: "p1", name: "A", role: "player", muted: false, track: null },
        { pid: "p2", name: "B", role: "player", muted: false, track: null },
      ],
    };

    const next = applyRosterAction(state, { type: "mute", pid: "p1", muted: true });

    expect(next.participants.find((p) => p.pid === "p1")?.muted).toBe(true);
    expect(next.participants.find((p) => p.pid === "p2")?.muted).toBe(false);
  });

  test("never mutates the input state", () => {
    const state: RosterState = { participants: [{ pid: "p1", name: "A", role: "player", muted: false, track: null }] };
    const snapshot = JSON.parse(JSON.stringify(state));

    applyRosterAction(state, { type: "mute", pid: "p1", muted: true });

    expect(state).toEqual(snapshot);
  });
});
