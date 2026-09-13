import { adoptOwnEcho, commitOwn, newOwnBlob } from "./ownBlob";

type Blob = { rev?: number; hand: string[] };

describe("ownBlob (issue #496)", () => {
  it("stamps a rising rev on every commit and keeps the payload's identity", () => {
    const own = newOwnBlob<Blob>();
    const hand = ["Ace"];
    const first = commitOwn(own, { hand });
    const second = commitOwn(own, { hand });
    expect([first.rev, second.rev]).toEqual([1, 2]);
    expect(own.current).toBe(second);
    expect(second.hand).toBe(hand);
  });

  it("seeds from the first echo whatever its rev (the join replay)", () => {
    const own = newOwnBlob<Blob>();
    expect(adoptOwnEcho(own, { hand: ["Ace"] })).toBe(true);
    expect(own).toEqual({ current: { hand: ["Ace"] }, rev: 0 });

    const replayed = newOwnBlob<Blob>();
    adoptOwnEcho(replayed, { rev: 12, hand: [] });
    expect(commitOwn(replayed, { hand: [] }).rev).toBe(13);
  });

  it("ignores my own echo and anything older once I have written", () => {
    const own = newOwnBlob<Blob>();
    commitOwn(own, { hand: ["Ace", "Bolt"] });
    const played = commitOwn(own, { hand: ["Bolt"] });

    expect(adoptOwnEcho(own, { rev: 1, hand: ["Ace", "Bolt"] })).toBe(false);
    expect(adoptOwnEcho(own, { rev: 2, hand: ["Bolt"] })).toBe(false);
    expect(adoptOwnEcho(own, { hand: ["Ace", "Bolt"] })).toBe(false); // pre-rev client
    expect(own.current).toBe(played);
  });

  it("adopts a strictly newer copy of my blob", () => {
    const own = newOwnBlob<Blob>();
    commitOwn(own, { hand: ["Ace"] });
    expect(adoptOwnEcho(own, { rev: 5, hand: ["Cure"] })).toBe(true);
    expect(own.rev).toBe(5);
    expect(commitOwn(own, { hand: [] }).rev).toBe(6);
  });

  it("never adopts a missing blob", () => {
    const own = newOwnBlob<Blob>();
    expect(adoptOwnEcho(own, undefined)).toBe(false);
    expect(own.current).toBeUndefined();
  });
});
