import {
  REMATCH_IDLE,
  RematchOfferEvent,
  RematchOfferState,
  rematchNoticeText,
  rematchOfferReducer,
} from "./rematchOffer";
import type { PlayerId } from "./protocol";

const P1 = "p1" as PlayerId;
const P2 = "p2" as PlayerId;

const run = (events: RematchOfferEvent[], from: RematchOfferState = REMATCH_IDLE) =>
  events.reduce(rematchOfferReducer, from);

describe("rematchOfferReducer — the requester (p1)", () => {
  it("offer → waiting → the room is ready", () => {
    expect(run([{ type: "OFFER" }])).toEqual({ phase: "offering" });
    expect(run([{ type: "OFFER" }, { type: "READY", roomId: "NEW1", currentRoom: "OLD1" }])).toEqual({
      phase: "ready",
      roomId: "NEW1",
    });
  });

  it("a declined offer brings the button back with a notice naming who declined", () => {
    expect(run([{ type: "OFFER" }, { type: "CLOSED", reason: "declined", player: P2 }])).toEqual({
      phase: "idle",
      notice: { reason: "declined", player: P2 },
    });
  });

  it.each(["disconnected", "timeout", "unavailable"] as const)("closed: %s → idle with that notice", (reason) => {
    const s = run([{ type: "OFFER" }, { type: "CLOSED", reason }]);
    expect(s).toEqual({ phase: "idle", notice: { reason } });
  });

  it("cancel goes straight back to idle, and our own cancel echoing back says nothing", () => {
    expect(run([{ type: "OFFER" }, { type: "CANCEL" }])).toEqual(REMATCH_IDLE);
    expect(
      run([{ type: "OFFER" }, { type: "CANCEL" }, { type: "CLOSED", reason: "cancelled", player: P1 }])
    ).toEqual(REMATCH_IDLE);
  });

  it("after a refresh the server re-sends OFFERED from ourselves: we are still waiting", () => {
    expect(run([{ type: "OFFERED", from: P1, me: P1 }])).toEqual({ phase: "offering" });
  });

  it("crossing offers: the other player's OFFERED while ours is out keeps us waiting for the room", () => {
    expect(run([{ type: "OFFER" }, { type: "OFFERED", from: P2, me: P1 }])).toEqual({ phase: "offering" });
  });

  it("a refusal (ERROR REMATCH_UNAVAILABLE) returns to idle with the server's words", () => {
    expect(run([{ type: "OFFER" }, { type: "REFUSED", message: "Another player's client cannot answer" }])).toEqual({
      phase: "idle",
      notice: { reason: "refused", message: "Another player's client cannot answer" },
    });
  });

  it("a second OFFER while one is out changes nothing", () => {
    const offering = run([{ type: "OFFER" }]);
    expect(rematchOfferReducer(offering, { type: "OFFER" })).toBe(offering);
  });

  it("a fresh offer clears the last notice", () => {
    const declined = run([{ type: "OFFER" }, { type: "CLOSED", reason: "declined", player: P2 }]);
    expect(rematchOfferReducer(declined, { type: "OFFER" })).toEqual({ phase: "offering" });
  });
});

describe("rematchOfferReducer — the other player (p2)", () => {
  const offered: RematchOfferEvent = { type: "OFFERED", from: P1, me: P2 };

  it("sees the offer, accepts, then moves to the new room", () => {
    expect(run([offered])).toEqual({ phase: "incoming", from: P1 });
    expect(run([offered, { type: "ACCEPT" }])).toEqual({ phase: "accepting" });
    expect(run([offered, { type: "ACCEPT" }, { type: "READY", roomId: "NEW1", currentRoom: "OLD1" }])).toEqual({
      phase: "ready",
      roomId: "NEW1",
    });
  });

  it("declines: back to idle, and the echo of its own decline adds no notice", () => {
    expect(run([offered, { type: "DECLINE" }])).toEqual(REMATCH_IDLE);
    expect(run([offered, { type: "DECLINE" }, { type: "CLOSED", reason: "declined", player: P2 }])).toEqual(
      REMATCH_IDLE
    );
  });

  it("the offerer cancelling takes the prompt away with a notice", () => {
    expect(run([offered, { type: "CLOSED", reason: "cancelled", player: P1 }])).toEqual({
      phase: "idle",
      notice: { reason: "cancelled", player: P1 },
    });
  });

  it("ACCEPT/DECLINE with nothing incoming do nothing", () => {
    expect(rematchOfferReducer(REMATCH_IDLE, { type: "ACCEPT" })).toBe(REMATCH_IDLE);
    expect(rematchOfferReducer(REMATCH_IDLE, { type: "DECLINE" })).toBe(REMATCH_IDLE);
  });
});

describe("rematchOfferReducer — guards", () => {
  it("never moves to the room this tab already sits in (stale READY)", () => {
    const offering = run([{ type: "OFFER" }]);
    expect(rematchOfferReducer(offering, { type: "READY", roomId: "old1", currentRoom: "OLD1" })).toBe(offering);
  });

  it("once ready, nothing un-builds the room", () => {
    const ready = run([{ type: "OFFER" }, { type: "READY", roomId: "NEW1", currentRoom: "OLD1" }]);
    expect(rematchOfferReducer(ready, { type: "CLOSED", reason: "timeout" })).toBe(ready);
    expect(rematchOfferReducer(ready, { type: "REFUSED", message: "x" })).toBe(ready);
  });

  it("a CLOSED with nothing open on our side is ignored", () => {
    expect(rematchOfferReducer(REMATCH_IDLE, { type: "CLOSED", reason: "timeout" })).toBe(REMATCH_IDLE);
  });
});

describe("rematchNoticeText", () => {
  const nameOf = (p: PlayerId) => (p === P2 ? "Dean" : "You");

  it.each([
    [{ reason: "declined", player: P2 }, "Dean declined the rematch"],
    [{ reason: "cancelled", player: P2 }, "Dean withdrew the rematch offer"],
    [{ reason: "disconnected", player: P2 }, "Dean left — no rematch"],
    [{ reason: "timeout" }, "No answer — the rematch offer expired"],
    [{ reason: "unavailable", player: P2 }, "Dean needs to refresh to rematch"],
    [{ reason: "unavailable" }, "Couldn't start the rematch — try again"],
    [
      { reason: "refused", message: "Another player's client cannot answer a rematch offer" },
      "Your opponent needs to refresh to rematch",
    ],
    [{ reason: "refused", message: "This room has already been rematched" }, "Rematch unavailable — This room has already been rematched"],
  ] as const)("%j → %s", (notice, text) => {
    expect(rematchNoticeText(notice, nameOf)).toBe(text);
  });
});
