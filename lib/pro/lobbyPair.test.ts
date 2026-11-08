/** The matched-mode state machine (#1556): every transition, and what it asks the page to do. */
import type { PresenceEntry } from "./lobbyProtocol";
import {
  livePartner,
  nudgeReplyFailMessage,
  pairEndedMessage,
  pairPartnerName,
  partnerReady,
  reducePair,
  type LobbyPair,
} from "./lobbyPair";

const SAM: PresenceEntry = { id: "sam", state: "picking", sinceMs: 1, displayName: "Sam" };

const paired = (role: "host" | "guest"): LobbyPair =>
  reducePair(null, { type: "paired", pairId: "P", role, with: SAM }).pair!;

describe("reducePair", () => {
  it("PAIRED opens a pair for either role, no room, not ready", () => {
    expect(reducePair(null, { type: "paired", pairId: "P", role: "host", with: SAM })).toEqual({
      pair: { pairId: "P", role: "host", with: SAM, roomId: null, ready: false },
      effects: [],
    });
    expect(paired("guest")).toMatchObject({ role: "guest", roomId: null, ready: false });
  });

  it("host Go creates; ROOM_CREATED relays the id once", () => {
    const go = reducePair(paired("host"), { type: "go" });
    expect(go.effects).toEqual([{ type: "create" }]);
    expect(go.pair?.ready).toBe(true);
    // a second Go is a no-op (the create already went out)
    expect(reducePair(go.pair, { type: "go" }).effects).toEqual([]);
    const created = reducePair(go.pair, { type: "created", roomId: "R1" });
    expect(created.effects).toEqual([{ type: "pairRoom", pairId: "P", roomId: "R1" }]);
    expect(created.pair?.roomId).toBe("R1");
    expect(reducePair(created.pair, { type: "created", roomId: "R1" }).effects).toEqual([]);
  });

  it("a host that has not pressed Go relays nothing", () => {
    expect(reducePair(paired("host"), { type: "created", roomId: "R1" }).effects).toEqual([]);
  });

  it("PAIR_ROOM sets the guest's roomId; Go then joins it", () => {
    const room = reducePair(paired("guest"), { type: "room", pairId: "P", roomId: "R1", seated: false });
    expect(room.pair?.roomId).toBe("R1");
    expect(room.effects).toEqual([]);
    expect(reducePair(room.pair, { type: "go" }).effects).toEqual([{ type: "join", roomId: "R1" }]);
  });

  it("guest Go before PAIR_ROOM is ready; PAIR_ROOM then joins", () => {
    const go = reducePair(paired("guest"), { type: "go" });
    expect(go.effects).toEqual([]);
    expect(go.pair?.ready).toBe(true);
    const room = reducePair(go.pair, { type: "room", pairId: "P", roomId: "R1", seated: false });
    expect(room.effects).toEqual([{ type: "join", roomId: "R1" }]);
  });

  it("ignores a PAIR_ROOM for another pair, or one that arrives once seated", () => {
    const go = reducePair(paired("guest"), { type: "go" }).pair;
    expect(reducePair(go, { type: "room", pairId: "OTHER", roomId: "R1", seated: false }).pair).toBe(go);
    expect(reducePair(go, { type: "room", pairId: "P", roomId: "R2", seated: true }).effects).toEqual([]);
  });

  it("PAIR_ENDED clears; leaves the seat only if we hold one", () => {
    expect(reducePair(paired("host"), { type: "ended", pairId: "P", seated: false })).toEqual({ pair: null, effects: [] });
    expect(reducePair(paired("host"), { type: "ended", pairId: "P", seated: true })).toEqual({
      pair: null,
      effects: [{ type: "leave" }],
    });
    const stale = paired("guest");
    expect(reducePair(stale, { type: "ended", pairId: "OLD", seated: false }).pair).toBe(stale);
  });

  it("our Cancel tells the server, then leaves the seat only if we hold one", () => {
    expect(reducePair(paired("guest"), { type: "cancel", seated: false })).toEqual({
      pair: null,
      effects: [{ type: "cancelPair", pairId: "P" }],
    });
    expect(reducePair(paired("host"), { type: "cancel", seated: true })).toEqual({
      pair: null,
      effects: [{ type: "cancelPair", pairId: "P" }, { type: "leave" }],
    });
    expect(reducePair(null, { type: "cancel", seated: true })).toEqual({ pair: null, effects: [] });
  });

  it("clear drops the pair silently", () => {
    expect(reducePair(paired("guest"), { type: "clear", seated: false })).toEqual({ pair: null, effects: [] });
  });
});

describe("partner helpers", () => {
  it("reads the partner live from the snapshot, falling back to PAIRED", () => {
    const pair = paired("guest");
    const live = { ...SAM, heroId: "king-kong", heroName: "King Kong" };
    expect(livePartner(pair, [live])).toBe(live);
    expect(livePartner(pair, [])).toBe(SAM);
  });

  it("marks the host ready once its room is relayed; never the guest", () => {
    expect(partnerReady(paired("guest"))).toBe(false);
    expect(partnerReady({ ...paired("guest"), roomId: "R1" })).toBe(true);
    expect(partnerReady({ ...paired("host"), roomId: "R1" })).toBe(false);
  });

  it("names and toast copy", () => {
    expect(pairPartnerName(SAM)).toBe("Sam");
    expect(pairPartnerName({ ...SAM, displayName: " " })).toBe("Anonymous");
    expect(pairEndedMessage("cancelled", "Sam")).toBe("Sam cancelled");
    expect(pairEndedMessage("left", "Sam")).toBe("Sam left");
    expect(pairEndedMessage("expired", "Sam")).toBe("Match request expired");
    expect(nudgeReplyFailMessage("expired", "Sam")).toBe("That request expired");
    expect(nudgeReplyFailMessage("busy", "Sam")).toBe("Sam is already matched");
    expect(nudgeReplyFailMessage("unknown", "Sam")).toBe("Sam left");
  });
});
