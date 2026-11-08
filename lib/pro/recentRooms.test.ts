/**
 * #1550: stale Pro room keys must not pile up in localStorage, and a full
 * origin must never make a write throw.
 */
const mockCapture = jest.fn();
jest.mock("../analytics", () => ({
  captureException: (...a: unknown[]) => mockCapture(...a),
}));

import { getRoomBots, getToken, rememberRoom, retireFinishedRoom, setResumeToken, setRoomBots, setToken, sweepStaleRoomKeys } from "./recentRooms";
import { listReplays, saveReplay } from "./replayStore";

const HOUR = 60 * 60 * 1000;
const quota = () => Object.assign(new Error("full"), { name: "QuotaExceededError" });

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  mockCapture.mockClear();
  jest.restoreAllMocks();
});

describe("retireFinishedRoom", () => {
  it("drops the browser-wide blob, token and bots, keeping this tab's seat and bots", () => {
    setToken("R1", "tok");
    setResumeToken("R1", "blob");
    setRoomBots("R1", { p2: "hard" });
    retireFinishedRoom("R1");
    expect(localStorage.getItem("unbrewed-pro-resume-R1")).toBeNull();
    expect(localStorage.getItem("unbrewed-pro-token-R1")).toBeNull();
    expect(localStorage.getItem("unbrewed-pro-bots-R1")).toBeNull();
    expect(getToken("R1")).toBe("tok");
    expect(getRoomBots("R1")).toEqual({ p2: "hard" });
  });

  it("hands a browser-wide token to a tab that never had its own copy", () => {
    localStorage.setItem("unbrewed-pro-token-R1", "tok");
    retireFinishedRoom("R1");
    expect(localStorage.getItem("unbrewed-pro-token-R1")).toBeNull();
    expect(getToken("R1")).toBe("tok");
  });
});

describe("sweepStaleRoomKeys", () => {
  it("removes keys of rooms missing from the index or past MAX_AGE_MS, keeps live ones", () => {
    const now = Date.now();
    localStorage.setItem(
      "unbrewed-pro-recent-rooms",
      JSON.stringify([
        { roomId: "LIVE", ts: now - HOUR },
        { roomId: "OLD", ts: now - 25 * HOUR },
      ]),
    );
    for (const room of ["LIVE", "OLD", "GONE"]) {
      localStorage.setItem(`unbrewed-pro-resume-${room}`, "b");
      localStorage.setItem(`unbrewed-pro-token-${room}`, "t");
      localStorage.setItem(`unbrewed-pro-bots-${room}`, "{}");
    }
    localStorage.setItem("unrelated", "x");
    const removed = sweepStaleRoomKeys(now);
    expect(removed.sort()).toEqual(
      ["OLD", "GONE"].flatMap((r) => [`unbrewed-pro-bots-${r}`, `unbrewed-pro-resume-${r}`, `unbrewed-pro-token-${r}`]).sort(),
    );
    expect(localStorage.getItem("unbrewed-pro-resume-LIVE")).toBe("b");
    expect(localStorage.getItem("unrelated")).toBe("x");
    expect(localStorage.getItem("unbrewed-pro-recent-rooms")).not.toBeNull();
  });

  it("spares rooms this tab is seated in", () => {
    sessionStorage.setItem("unbrewed-pro-token-MINE", "t");
    localStorage.setItem("unbrewed-pro-bots-MINE", "{}");
    expect(sweepStaleRoomKeys()).toEqual([]);
  });
});

describe("full storage", () => {
  it("frees stale room keys, retries, and lands the write", () => {
    localStorage.setItem("unbrewed-pro-resume-STALE", "x".repeat(100));
    const real = Storage.prototype.setItem;
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, k: string, v: string) {
      if (this === localStorage && localStorage.getItem("unbrewed-pro-resume-STALE") !== null) throw quota();
      real.call(this, k, v);
    });
    rememberRoom("R1"); // index write fails first, then succeeds after the sweep
    setResumeToken("R1", "blob");
    expect(localStorage.getItem("unbrewed-pro-resume-STALE")).toBeNull();
    expect(localStorage.getItem("unbrewed-pro-resume-R1")).toBe("blob");
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("evicts the oldest unstarred replay when no stale keys remain", () => {
    const bundle = (n: number) =>
      ({
        config: { seed: n, players: [] },
        actionLog: [],
        meta: { heroes: ["a", "b"], endedAt: n, winner: "p1", turns: 1, mapTitle: "m" },
      }) as unknown as Parameters<typeof saveReplay>[0];
    saveReplay(bundle(1), 1);
    saveReplay(bundle(2), 2);
    const [newest, oldest] = listReplays();
    const real = Storage.prototype.setItem;
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, k: string, v: string) {
      if (k === "unbrewed-pro-resume-R1" && localStorage.getItem(`unbrewed:pro:replay:${oldest.id}`) !== null) throw quota();
      real.call(this, k, v);
    });
    setResumeToken("R1", "blob");
    expect(localStorage.getItem("unbrewed-pro-resume-R1")).toBe("blob");
    expect(listReplays().map((r) => r.id)).toEqual([newest.id]);
  });

  it("never throws: reports one handled exception per key family and returns", () => {
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw quota();
    });
    expect(() => {
      setResumeToken("R1", "blob");
      setResumeToken("R1", "blob2");
      setToken("R1", "tok");
      setRoomBots("R1", { p2: "easy" });
      rememberRoom("R1");
    }).not.toThrow();
    const families = mockCapture.mock.calls.map((c) => c[1].storage_key);
    expect(families.filter((f: string) => f === "unbrewed-pro-resume-")).toHaveLength(1);
    expect(mockCapture.mock.calls[0][1]).toMatchObject({ handled: true });
  });
});
