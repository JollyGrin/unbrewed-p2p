/**
 * Local replay persistence (#122): save/list/load, content-idempotency, star
 * pinning, lazy retention purge, byte meter, and oldest-unstarred eviction.
 * jsdom gives us a real localStorage.
 */
import type { ReplayBundle } from "./protocol";
import {
  RETENTION_DAYS,
  STORAGE_BUDGET_BYTES,
  purgeExpiredOnLoad,
  resetLoadSweepForTests,
  takePurgedReplays,
  deleteReplay,
  listReplays,
  loadReplay,
  purgeExpired,
  replayId,
  saveReplay,
  storageMeter,
  toggleStar,
} from "./replayStore";

const DAY = 24 * 60 * 60 * 1000;

function bundle(overrides: { seed?: number; heroes?: [string, string]; winner?: "p1" | "p2" | null; pad?: number } = {}): ReplayBundle {
  const { seed = 1, heroes = ["king-kong", "thrall"], winner = "p1", pad = 0 } = overrides;
  return {
    v: 1,
    engine: { schemaVersion: 1, dslVersion: "0.11.0" },
    config: {
      seed,
      players: {
        p1: { heroId: heroes[0], hero: { pad: "x".repeat(pad) }, cards: [] },
        p2: { heroId: heroes[1], hero: {}, cards: [] },
      },
      map: { schemaVersion: "1.0", id: "mended-drum", meta: { title: "The Mended Drum", minPlayers: 2, maxPlayers: 2, specialRules: false }, zones: [], spaces: [] },
    },
    actionLog: [],
    meta: { winner, heroes: { p1: heroes[0], p2: heroes[1] }, turns: 5, endedAt: 1_000, mapTitle: "The Mended Drum" },
  };
}

beforeEach(() => {
  window.localStorage.clear();
  resetLoadSweepForTests();
});

describe("saveReplay / listReplays", () => {
  it("saves and lists a replay with denormalized metadata", () => {
    const res = saveReplay(bundle());
    expect(res.ok).toBe(true);
    const list = listReplays();
    expect(list).toHaveLength(1);
    expect(list[0].heroes).toEqual(["king-kong", "thrall"]);
    expect(list[0].winner).toBe("p1");
    expect(list[0].bytes).toBeGreaterThan(0);
    expect(loadReplay(res.id)).toMatchObject({ v: 1 });
  });

  it("is idempotent by content — the same match saved twice stays one entry", () => {
    saveReplay(bundle({ seed: 7 }));
    saveReplay(bundle({ seed: 7 }));
    expect(listReplays()).toHaveLength(1);
    // a different match is a distinct entry
    saveReplay(bundle({ seed: 8 }));
    expect(listReplays()).toHaveLength(2);
  });

  it("preserves a star across a re-save of the same match", () => {
    const { id } = saveReplay(bundle({ seed: 9 }));
    toggleStar(id, true);
    saveReplay(bundle({ seed: 9 }));
    expect(listReplays().find((e) => e.id === id)?.starred).toBe(true);
  });
});

describe("retention", () => {
  it("purges unstarred replays older than the window but keeps starred", () => {
    const now = 100 * DAY;
    const old = saveReplay(bundle({ seed: 1 }), now - (RETENTION_DAYS + 1) * DAY);
    const oldStarred = saveReplay(bundle({ seed: 2 }), now - (RETENTION_DAYS + 1) * DAY);
    const fresh = saveReplay(bundle({ seed: 3 }), now - 1 * DAY);
    toggleStar(oldStarred.id, true);

    const purged = purgeExpired(now);
    expect(purged).toEqual([old.id]);
    const ids = listReplays().map((e) => e.id);
    expect(ids).toContain(oldStarred.id);
    expect(ids).toContain(fresh.id);
    expect(ids).not.toContain(old.id);
    expect(loadReplay(old.id)).toBeNull();
  });
});

describe("load-time purge (#1551)", () => {
  const now = 100 * DAY;
  const stale = now - (RETENTION_DAYS + 1) * DAY;

  it("purgeExpiredOnLoad sweeps once per page load, starred survive", () => {
    const old = saveReplay(bundle({ seed: 1 }), stale);
    const oldStarred = saveReplay(bundle({ seed: 2 }), stale);
    toggleStar(oldStarred.id, true);

    purgeExpiredOnLoad(now);
    expect(listReplays().map((e) => e.id)).toEqual([oldStarred.id]);
    expect(loadReplay(old.id)).toBeNull();

    // A second call in the same page load is a no-op.
    const later = saveReplay(bundle({ seed: 3 }), stale);
    purgeExpiredOnLoad(now);
    expect(listReplays().map((e) => e.id)).toContain(later.id);
  });

  it("the Replays page still reports what the app-wide sweep purged, once", () => {
    const old = saveReplay(bundle({ seed: 1 }), stale);
    purgeExpiredOnLoad(now); // _app ran first
    expect(takePurgedReplays(now)).toEqual([old.id]);
    expect(takePurgedReplays(now)).toEqual([]); // reported once
  });

  it("takePurgedReplays sweeps on its own if the load sweep hasn't run", () => {
    const old = saveReplay(bundle({ seed: 1 }), stale);
    expect(takePurgedReplays(now)).toEqual([old.id]);
    expect(listReplays()).toHaveLength(0);
  });

  it("never throws when storage is blocked", () => {
    const spy = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    try {
      expect(() => purgeExpiredOnLoad(now)).not.toThrow();
    } finally {
      spy.mockRestore();
    }
  });
});

describe("budget (#1551)", () => {
  it("leaves half the ~5 MiB origin quota for everything else", () => {
    expect(STORAGE_BUDGET_BYTES).toBe(2.5 * 1024 * 1024);
    expect(storageMeter().budgetBytes).toBe(STORAGE_BUDGET_BYTES);
  });

  it("saveReplay defaults to the new budget: evicts oldest unstarred past 2.5 MiB, never starred", () => {
    const pad = 900 * 1024; // ~0.9 MiB each: two fit, a third crosses 2.5 MiB
    const a = saveReplay(bundle({ seed: 1, pad }), 10);
    const b = saveReplay(bundle({ seed: 2, pad }), 20);
    toggleStar(a.id, true);
    expect(a.evicted).toEqual([]);
    expect(b.evicted).toEqual([]);

    // Under the old 5 MiB budget this would have fit with no eviction.
    const c = saveReplay(bundle({ seed: 3, pad }), 30);
    expect(c.ok).toBe(true);
    expect(c.evicted).toEqual([b.id]);
    expect(listReplays().map((e) => e.id).sort()).toEqual([a.id, c.id].sort());
    expect(storageMeter().usedBytes).toBeLessThanOrEqual(STORAGE_BUDGET_BYTES);
  });
});

describe("storage meter + eviction", () => {
  it("meter sums serialized bytes", () => {
    saveReplay(bundle({ seed: 1 }));
    const m = storageMeter();
    expect(m.usedBytes).toBe(listReplays()[0].bytes);
    expect(m.ratio).toBeGreaterThan(0);
  });

  it("evicts oldest UNSTARRED first when over budget; never a starred one", () => {
    // Tiny injected budget so a couple of small bundles overflow it.
    const one = saveReplay(bundle({ seed: 1, pad: 400 }));
    const budget = listReplays()[0].bytes * 2 + 10; // room for ~2 bundles
    const a = saveReplay(bundle({ seed: 1, pad: 400 }), 10, budget); // re-save seed 1 (same id as `one`)
    expect(a.id).toBe(one.id);

    const b = saveReplay(bundle({ seed: 2, pad: 400 }), 20, budget);
    toggleStar(a.id, true); // pin the first — it must survive eviction
    const c = saveReplay(bundle({ seed: 3, pad: 400 }), 30, budget);
    // saving c should evict b (oldest unstarred), keeping starred a + new c
    expect(c.evicted).toContain(b.id);
    const ids = listReplays().map((e) => e.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(c.id);
    expect(ids).not.toContain(b.id);
  });
});

describe("delete", () => {
  it("removes both the index entry and the stored bundle", () => {
    const { id } = saveReplay(bundle({ seed: 5 }));
    deleteReplay(id);
    expect(listReplays()).toHaveLength(0);
    expect(loadReplay(id)).toBeNull();
  });
});

describe("replayId", () => {
  it("is stable for the same match and differs across matches", () => {
    expect(replayId(bundle({ seed: 1 }))).toBe(replayId(bundle({ seed: 1 })));
    expect(replayId(bundle({ seed: 1 }))).not.toBe(replayId(bundle({ seed: 2 })));
  });
});
