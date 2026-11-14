import { fighterMoveReading, fighterMoveTitle, moveSetUntil } from "./fighterMove";
import { fighterStatusBadgesFor } from "./fighterStatuses";

// Protocol v40 / engine #1059: `ViewFighter.move` + the `MOVE_SET` status.
describe("fighterMoveReading", () => {
  it("an older server sends no move: the printed fallback, never 'changed'", () => {
    expect(fighterMoveReading({ statuses: [] }, 2)).toEqual({ value: 2, changed: false, until: "" });
    expect(fighterMoveReading(undefined, 3)).toEqual({ value: 3, changed: false, until: "" });
    expect(fighterMoveReading(undefined)).toEqual({ value: null, changed: false, until: "" });
    // a MOVE_SET with no number to go with it cannot be shown as a changed value
    expect(
      fighterMoveReading({ statuses: [{ kind: "MOVE_SET", expiresAtTurn: 9, expiresAt: "END" }] }, 2).changed
    ).toBe(false);
  });

  it("the engine's number wins over the printed one, changed or not", () => {
    expect(fighterMoveReading({ move: 2, statuses: [] }, 2)).toEqual({ value: 2, changed: false, until: "" });
    // a transform the deck JSON does not know about: the engine is still right
    expect(fighterMoveReading({ move: 3 }, 2).value).toBe(3);
  });

  it("POMNI's Reward 4: move 4 with a MOVE_SET stamp is a changed value with an end", () => {
    const pomni = { move: 4, statuses: [{ kind: "MOVE_SET", expiresAtTurn: 9, expiresAt: "END" as const }] };
    const reading = fighterMoveReading(pomni, 2);
    expect(reading).toEqual({ value: 4, changed: true, until: "until the end of turn 9" });
    expect(fighterMoveTitle(reading)).toBe("Move 4 — changed from its printed value, until the end of turn 9");
    // ... and back at her printed 2 the engine drops the status: nothing is marked
    expect(fighterMoveReading({ move: 2, statuses: [] }, 2).changed).toBe(false);
  });

  it("a 'cannot move' 0 (King Kong's Smash and grab, Jason) reads as 0, not as missing", () => {
    const pinned = { move: 0, statuses: [{ kind: "MOVE_SET", expiresAtTurn: 4, expiresAt: "START" as const }] };
    expect(fighterMoveReading(pinned, 3)).toEqual({ value: 0, changed: true, until: "until the start of turn 4" });
    expect(moveSetUntil(pinned)).toBe("until the start of turn 4");
  });

  it("a DEFEATED fighter's stale move is ignored: printed fallback, never 'changed'", () => {
    expect(fighterMoveReading({ move: 0, defeated: true, statuses: [] }, 2)).toEqual({ value: 2, changed: false, until: "" });
    expect(fighterMoveReading({ move: 0, defeated: true }).value).toBeNull();
  });

  it("a plain unchanged move has a plain title", () => {
    expect(fighterMoveTitle(fighterMoveReading({ move: 2 }, 2))).toBe("Move 2");
    expect(fighterMoveTitle(fighterMoveReading(undefined))).toBe("Move");
  });
});

describe("MOVE_SET board badge", () => {
  it("carries the current move as text — including 0 and 1 — and when it ends", () => {
    const badges = fighterStatusBadgesFor({
      move: 0,
      statuses: [{ kind: "MOVE_SET", expiresAtTurn: 4, expiresAt: "END" }],
    });
    expect(badges).toHaveLength(1);
    expect(badges[0]).toMatchObject({
      kind: "MOVE_SET",
      icon: "👣",
      label: "Move 0",
      text: "0",
      title: "Move 0 — changed from its printed value, until the end of turn 4",
    });
    expect(fighterStatusBadgesFor({ move: 4, statuses: [{ kind: "MOVE_SET", expiresAtTurn: 9, expiresAt: "END" }] })[0].text).toBe("4");
  });

  it("sits beside PINNED as its own badge, and is absent with no status", () => {
    const both = fighterStatusBadgesFor({
      move: 0,
      statuses: [{ kind: "PINNED" }, { kind: "MOVE_SET", expiresAtTurn: 4, expiresAt: "END" }],
    });
    expect(both.map((b) => b.kind)).toEqual(["PINNED", "MOVE_SET"]);
    expect(both[0].text).toBeUndefined();
    expect(fighterStatusBadgesFor({ move: 2, statuses: [] })).toEqual([]);
  });

  it("without a move on the view the badge still shows, with no number", () => {
    const [badge] = fighterStatusBadgesFor({ statuses: [{ kind: "MOVE_SET", expiresAtTurn: 4, expiresAt: "END" }] });
    expect(badge).toMatchObject({ label: "Move changed" });
    expect(badge.text).toBeUndefined();
  });
});
