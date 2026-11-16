/** Puzzle helpers (issue #1679): progress, catalogue, the board's room for the open hand, notice routing. */
import { toast } from "react-hot-toast";
import { insetForOpenHand, OPEN_HAND_GAP } from "./mobileLayout";
import { fetchPuzzleCatalogue } from "./puzzleCatalogue";
import { markPuzzleSolved, nextUnsolvedPuzzle, PUZZLE_PROGRESS_KEY, readSolvedPuzzles } from "./puzzleProgress";
import { makeViewToast } from "./viewNotices";

const cat = ["a", "b", "c", "d"].map((id) => ({ id }));

describe("puzzle progress", () => {
  beforeEach(() => window.localStorage.clear());

  it("remembers a solve once, in this browser", () => {
    expect(readSolvedPuzzles()).toEqual([]);
    expect(markPuzzleSolved("a")).toBe(true);
    expect(markPuzzleSolved("a")).toBe(false);
    expect(markPuzzleSolved("b")).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(PUZZLE_PROGRESS_KEY)!)).toEqual(["a", "b"]);
  });

  it("reads garbage as nothing solved", () => {
    window.localStorage.setItem(PUZZLE_PROGRESS_KEY, "{not json");
    expect(readSolvedPuzzles()).toEqual([]);
    window.localStorage.setItem(PUZZLE_PROGRESS_KEY, JSON.stringify({ a: true }));
    expect(readSolvedPuzzles()).toEqual([]);
    window.localStorage.setItem(PUZZLE_PROGRESS_KEY, JSON.stringify(["a", 3, null]));
    expect(readSolvedPuzzles()).toEqual(["a"]);
  });

  it("next unsolved: after the current one in catalogue order, then before it, never itself", () => {
    expect(nextUnsolvedPuzzle(cat, [])?.id).toBe("a");
    expect(nextUnsolvedPuzzle(cat, ["a"])?.id).toBe("b");
    expect(nextUnsolvedPuzzle(cat, ["a"], "a")?.id).toBe("b");
    expect(nextUnsolvedPuzzle(cat, ["a", "b"], "b")?.id).toBe("c");
    // wraps to an earlier unsolved one
    expect(nextUnsolvedPuzzle(cat, ["c", "d"], "d")?.id).toBe("a");
    // the current puzzle is skipped even while unsolved (a watched solution)
    expect(nextUnsolvedPuzzle(cat, ["a", "c", "d"], "b")).toBeNull();
    expect(nextUnsolvedPuzzle(cat, ["a", "b", "c", "d"], "d")).toBeNull();
    // a current id the catalogue no longer lists
    expect(nextUnsolvedPuzzle(cat, ["a"], "gone")?.id).toBe("b");
  });
});

describe("fetchPuzzleCatalogue", () => {
  const summary = (id: string, order: number) => ({
    id,
    order,
    goal: { enemyHero: "E", text: "Defeat E this turn" },
    heroes: { solver: { id: "s", name: "S" }, enemy: { id: "e", name: "E" } },
    source: { kind: "authored", turn: 1 },
    tags: [],
  });
  const answer = (body: unknown, ok = true) => {
    global.fetch = jest.fn(async () => ({ ok, status: ok ? 200 : 500, json: async () => body }) as Response) as unknown as typeof fetch;
  };

  it("asks the engine's http base and returns the puzzles in catalogue order", async () => {
    answer({ ok: true, puzzles: [summary("late", 30), summary("early", 10), { id: "broken" }] });
    const puzzles = await fetchPuzzleCatalogue({ wsUrl: "wss://engine.example/" });
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe("https://engine.example/puzzles.json");
    expect(puzzles?.map((p) => p.id)).toEqual(["early", "late"]);
  });

  it("is null on any failure: http error, wrong shape, empty list, network", async () => {
    answer({ ok: true, puzzles: [summary("a", 1)] }, false);
    expect(await fetchPuzzleCatalogue({ wsUrl: "ws://x" })).toBeNull();
    answer({ ok: false });
    expect(await fetchPuzzleCatalogue({ wsUrl: "ws://x" })).toBeNull();
    answer({ ok: true, puzzles: [] });
    expect(await fetchPuzzleCatalogue({ wsUrl: "ws://x" })).toBeNull();
    global.fetch = jest.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await fetchPuzzleCatalogue({ wsUrl: "ws://x" })).toBeNull();
  });
});

describe("insetForOpenHand", () => {
  const base = { top: 60, right: 240, bottom: 8, left: 8 };
  it("is the base inset with no open hand", () => {
    expect(insetForOpenHand(base, "rail", { width: 1100, height: 450 }, null)).toBe(base);
  });
  it("portrait: the board starts below the box", () => {
    expect(insetForOpenHand({ ...base, right: 8 }, "portrait", { width: 360, height: 600 }, { right: 220, bottom: 170 }).top).toBe(170 + OPEN_HAND_GAP);
  });
  it("landscape: the board moves beside the box only where that costs no board size", () => {
    const panel = { right: 250, bottom: 230 };
    // wide: 1100 - 258 - 240 = 602 >= (450 - 68) * 4/3 = 509
    expect(insetForOpenHand(base, "rail", { width: 1100, height: 450 }, panel).left).toBe(250 + OPEN_HAND_GAP);
    // narrow: 720 - 258 - 240 = 222 < 509 — the box floats over the board's edge as before
    expect(insetForOpenHand(base, "rail", { width: 720, height: 450 }, panel)).toBe(base);
  });
});

describe("makeViewToast", () => {
  it("is react-hot-toast itself without a notice callback", () => {
    expect(makeViewToast()).toBe(toast);
  });
  it("forwards every kind of notice as text and raises no toast", () => {
    const spies = [jest.spyOn(toast, "error"), jest.spyOn(toast, "loading"), jest.spyOn(toast, "success"), jest.spyOn(toast, "dismiss")];
    const seen: string[] = [];
    const routed = makeViewToast(() => (text) => seen.push(text));
    routed("plain", { id: "a", icon: "x" });
    routed.error("error");
    routed.loading("loading", { id: "b" });
    routed.success("success");
    routed.dismiss("b");
    expect(seen).toEqual(["plain", "error", "loading", "success"]);
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });
});
