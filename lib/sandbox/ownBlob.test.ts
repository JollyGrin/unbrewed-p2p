import {
  commitOwn,
  newOwnChannel,
  receiveOwn,
  releaseOwn,
  takeHeld,
} from "./ownBlob";

type Blob = { rev?: number; v: string };

const synced = () => {
  const own = newOwnChannel<Blob>();
  receiveOwn(own, undefined);
  return own;
};

describe("commitOwn", () => {
  it("stamps a rev that never goes backwards, even with a slow clock", () => {
    const own = synced();
    expect(commitOwn(own, { v: "a" }, 1000)).toEqual({ v: "a", rev: 1000 });
    expect(commitOwn(own, { v: "b" }, 900)).toEqual({ v: "b", rev: 1001 });
    expect(own.current).toEqual({ v: "b", rev: 1001 });
  });

  it("a refreshed page outranks its previous session's blobs", () => {
    // previous session wrote rev 5000 (a bare counter would restart at 1)
    const own = newOwnChannel<Blob>();
    releaseOwn(own); // replay never came — the page moved on without it
    const sent = commitOwn(own, { v: "new" }, 6000);
    expect(sent?.rev).toBe(6000);
    // the old session's replay finally lands: older, so ignored
    expect(receiveOwn(own, { v: "old", rev: 5000 })).toBe(false);
    expect(own.current?.v).toBe("new");
  });
});

describe("the join hold — always paired with its release", () => {
  it("holds a send made before the replay and renders it provisionally", () => {
    const own = newOwnChannel<Blob>();
    expect(commitOwn(own, { v: "init" }, 10)).toBeUndefined();
    expect(own.current).toEqual({ v: "init" });
    expect(own.held).toBe(true);
    expect(takeHeld(own)).toBe(false); // still waiting
  });

  it("releases on the replay: a real replayed blob replaces the provisional one", () => {
    const own = newOwnChannel<Blob>();
    commitOwn(own, { v: "auto-init" }, 10);
    expect(receiveOwn(own, { v: "my real board", rev: 40 })).toBe(true);
    expect(own.current?.v).toBe("my real board");
    expect(takeHeld(own)).toBe(true);
    expect(commitOwn(own, own.current!, 20)?.rev).toBe(41);
  });

  it("releases on the replay: the relay's empty placeholder keeps the held send", () => {
    const own = newOwnChannel<Blob>();
    commitOwn(own, { v: "auto-init" }, 10);
    expect(receiveOwn(own, undefined)).toBe(false);
    expect(own.current?.v).toBe("auto-init");
    expect(takeHeld(own)).toBe(true);
  });

  it("releases WITHOUT any replay (grace period) — never a gate", () => {
    const own = newOwnChannel<Blob>();
    commitOwn(own, { v: "token" }, 10);
    releaseOwn(own);
    expect(takeHeld(own)).toBe(true);
    expect(commitOwn(own, own.current!, 20)).toEqual({ v: "token", rev: 20 });
    // later sends go straight out
    expect(commitOwn(own, { v: "next" }, 30)?.rev).toBe(30);
  });

  it("a second placeholder frame before the flush can't wipe the held send", () => {
    const own = newOwnChannel<Blob>();
    commitOwn(own, { v: "auto-init" }, 10);
    receiveOwn(own, { v: "" }, (e) => !e?.v); // placeholder: keep held
    expect(receiveOwn(own, { v: "" })).toBe(false); // same rev 0, not newer
    expect(own.current?.v).toBe("auto-init");
    expect(takeHeld(own)).toBe(true);
  });

  it("a synced send carries whatever was held, so nothing is flushed twice", () => {
    const own = newOwnChannel<Blob>();
    commitOwn(own, { v: "held" }, 10);
    receiveOwn(own, undefined);
    commitOwn(own, { v: "sent" }, 20);
    expect(takeHeld(own)).toBe(false);
  });
});

describe("receiveOwn after sync", () => {
  it("ignores my own echo and anything older", () => {
    const own = synced();
    commitOwn(own, { v: "a" }, 100);
    const a = own.current;
    commitOwn(own, { v: "b" }, 200);
    expect(receiveOwn(own, { v: "a", rev: 100 })).toBe(false);
    expect(receiveOwn(own, { v: "b", rev: 200 })).toBe(false);
    expect(own.current?.v).toBe("b");
    expect(a).not.toBe(own.current);
  });

  it("adopts a strictly newer write (another tab under my name)", () => {
    const own = synced();
    commitOwn(own, { v: "mine" }, 100);
    expect(receiveOwn(own, { v: "other tab", rev: 150 })).toBe(true);
    expect(own.current?.v).toBe("other tab");
    expect(commitOwn(own, { v: "next" }, 120)?.rev).toBe(151);
  });

  it("a same-rev write from another tab is taken, my own same-rev echo is not", () => {
    const own = synced();
    commitOwn(own, { v: "mine" }, 100);
    const mine = own.current;
    expect(receiveOwn(own, JSON.parse(JSON.stringify(mine)))).toBe(false);
    expect(own.current).toBe(mine); // identity kept for in-flight closures
    expect(receiveOwn(own, { v: "other tab", rev: 100 })).toBe(true);
    expect(own.current?.v).toBe("other tab");
  });

  it("a blob from a client without rev only ever seeds", () => {
    const own = newOwnChannel<Blob>();
    expect(receiveOwn(own, { v: "legacy" })).toBe(true);
    commitOwn(own, { v: "mine" }, 5);
    expect(receiveOwn(own, { v: "legacy" })).toBe(false);
  });
});
