import { buildSocketURL, initializeWebsocket } from "./socket";

class FakeSocket {
  static instances: FakeSocket[] = [];
  readyState = 0;
  onopen?: () => void;
  onclose?: () => void;
  onmessage?: () => void;
  onerror?: () => void;
  constructor(readonly url: URL) {
    FakeSocket.instances.push(this);
  }
  send() {}
  close() {}
}

const RELAY = new URL("https://relay.example");

describe("buildSocketURL", () => {
  it("leaves a guest URL exactly as before: name only", () => {
    expect(buildSocketURL(RELAY, "g1", "alice b").toString()).toBe(
      "wss://relay.example/ws/g1?name=alice+b",
    );
    expect(
      buildSocketURL(
        new URL("http://localhost:1111"),
        "g1",
        "alice",
      ).toString(),
    ).toBe("ws://localhost:1111/ws/g1?name=alice");
  });

  it("appends account and discord next to name when signed in", () => {
    const url = buildSocketURL(RELAY, "g1", "alice", {
      accountId: "acct-1",
      discord: "dean&co",
    });
    expect(url.toString()).toBe(
      "wss://relay.example/ws/g1?name=alice&account=acct-1&discord=dean%26co",
    );
  });
});

describe("initializeWebsocket identity", () => {
  const realWebSocket = global.WebSocket;
  beforeEach(() => {
    jest.useFakeTimers();
    FakeSocket.instances = [];
    (global as any).WebSocket = FakeSocket;
  });
  afterEach(() => {
    jest.useRealTimers();
    global.WebSocket = realWebSocket;
  });

  it("re-reads the identity getter on each reconnect", () => {
    let identity: { accountId: string; discord: string } | undefined;
    initializeWebsocket({
      name: "alice",
      gid: "g1",
      connectURL: RELAY,
      identity: () => identity,
      onGameState: () => {},
      onGamePositions: () => {},
    });
    expect(FakeSocket.instances[0].url.toString()).toBe(
      "wss://relay.example/ws/g1?name=alice",
    );

    // The account resolves after the first connect: no new socket for it…
    identity = { accountId: "acct-1", discord: "dean" };
    expect(FakeSocket.instances).toHaveLength(1);

    // …but the next reconnect carries it.
    FakeSocket.instances[0].onclose?.();
    jest.advanceTimersByTime(1000);
    expect(FakeSocket.instances).toHaveLength(2);
    expect(FakeSocket.instances[1].url.toString()).toBe(
      "wss://relay.example/ws/g1?name=alice&account=acct-1&discord=dean",
    );
  });

  it("accepts a plain identity object", () => {
    initializeWebsocket({
      name: "alice",
      gid: "g1",
      connectURL: RELAY,
      identity: { accountId: "acct-1", discord: "dean" },
      onGameState: () => {},
      onGamePositions: () => {},
    });
    expect(FakeSocket.instances[0].url.searchParams.get("account")).toBe(
      "acct-1",
    );
  });
});
