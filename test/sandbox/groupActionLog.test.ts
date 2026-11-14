/**
 * Display-time grouping of the sandbox activity feed: runs of the same
 * action by the same player collapse to one counted line.
 */
import { SandboxLogEntry, mergeActionLog } from "@/lib/sandbox/gameLog";
import {
  GROUP_GAP_MS,
  groupActionLog,
  groupLabel,
  groupLabelParts,
} from "@/lib/sandbox/groupActionLog";

const T0 = 1_700_000_000_000;

/**
 * Build a newest-first feed from rows written oldest-first (the order they
 * happened), one second apart unless `at` (seconds from T0) is given.
 */
const feed = (rows: Array<[player: string, text: string, at?: number]>): SandboxLogEntry[] =>
  rows
    .map(([player, text, at], i) => ({
      key: `${player}-${i + 1}`,
      player,
      at: T0 + (at ?? i) * 1000,
      text,
    }))
    .reverse();

const labels = (entries: SandboxLogEntry[], gap?: number) =>
  groupActionLog(entries, gap).map((g) => `${g.player}: ${groupLabel(g)}`);

describe("groupActionLog", () => {
  it("returns nothing for an empty feed", () => {
    expect(groupActionLog([])).toEqual([]);
  });

  it("leaves a single entry as it is, with no count", () => {
    const [group, ...rest] = groupActionLog(feed([["ann", "Drew a card"]]));
    expect(rest).toEqual([]);
    expect(group).toMatchObject({ count: 1, base: "Drew a card", values: [], at: T0, firstAt: T0 });
    expect(groupLabelParts(group)).toEqual({ base: "Drew a card", count: null, detail: "" });
    expect(groupLabel(group)).toBe("Drew a card");
  });

  it("collapses five identical draws into one line with a count", () => {
    const entries = feed(Array.from({ length: 5 }, () => ["ann", "Drew a card"] as [string, string]));
    const groups = groupActionLog(entries);
    expect(groups).toHaveLength(1);
    expect(groupLabel(groups[0])).toBe("Drew a card ×5");
    expect(groups[0].count).toBe(5);
  });

  it("shows the latest time, keeps the earliest, and keeps every entry newest first", () => {
    const entries = feed([
      ["ann", "Drew a card", 0],
      ["ann", "Drew a card", 4],
      ["ann", "Drew a card", 9],
    ]);
    const [group] = groupActionLog(entries);
    expect(group.at).toBe(T0 + 9000);
    expect(group.firstAt).toBe(T0);
    expect(group.entries).toEqual(entries);
  });

  it("keys a group by its oldest entry, so it keeps its identity as it grows", () => {
    const two = feed([["ann", "Drew a card"], ["ann", "Drew a card"]]);
    const three = feed([["ann", "Drew a card"], ["ann", "Drew a card"], ["ann", "Drew a card"]]);
    expect(groupActionLog(two)[0].key).toBe("ann-1");
    expect(groupActionLog(three)[0].key).toBe("ann-1");
  });

  it("gives every group a unique key", () => {
    const groups = groupActionLog(
      feed([
        ["ann", "Drew a card"],
        ["ann", "Drew a card"],
        ["bob", "Drew a card"],
        ["ann", "Drew a card"],
        ["ann", "Discarded a card"],
      ]),
    );
    expect(new Set(groups.map((g) => g.key)).size).toBe(groups.length);
  });

  it("only groups adjacent entries: a different action in between breaks the run", () => {
    expect(
      labels(
        feed([
          ["ann", "Drew a card"],
          ["ann", "Drew a card"],
          ["ann", "Discarded a card"],
          ["ann", "Drew a card"],
        ]),
      ),
    ).toEqual(["ann: Drew a card", "ann: Discarded a card", "ann: Drew a card ×2"]);
  });

  it("another player's action in between breaks the run", () => {
    expect(
      labels(
        feed([
          ["ann", "Drew a card"],
          ["bob", "Drew a card"],
          ["ann", "Drew a card"],
        ]),
      ),
    ).toEqual(["ann: Drew a card", "bob: Drew a card", "ann: Drew a card"]);
  });

  it("never merges two players doing the same thing", () => {
    expect(
      labels(
        feed([
          ["ann", "Drew a card"],
          ["ann", "Drew a card"],
          ["bob", "Drew a card"],
          ["bob", "Drew a card"],
        ]),
      ),
    ).toEqual(["bob: Drew a card ×2", "ann: Drew a card ×2"]);
  });

  it("does not treat near-identical text as the same action", () => {
    expect(
      labels(
        feed([
          ["ann", "Drew a card"],
          ["ann", "Drew a card from deck"],
          ["ann", "Placed a card on top of deck"],
          ["ann", "Placed a card on bottom of deck"],
          ["ann", "Gave a card to bob"],
          ["ann", "Gave a card to cat"],
        ]),
      ),
    ).toHaveLength(6);
  });

  describe("time gap", () => {
    it("keeps entries within the gap together", () => {
      const entries = feed([
        ["ann", "Drew a card", 0],
        ["ann", "Drew a card", GROUP_GAP_MS / 1000],
      ]);
      expect(labels(entries)).toEqual(["ann: Drew a card ×2"]);
    });

    it("breaks the run when neighbours are further apart than the gap", () => {
      const entries = feed([
        ["ann", "Drew a card", 0],
        ["ann", "Drew a card", 1],
        ["ann", "Drew a card", GROUP_GAP_MS / 1000 + 2],
      ]);
      const groups = groupActionLog(entries);
      expect(groups.map(groupLabel)).toEqual(["Drew a card", "Drew a card ×2"]);
      expect(groups[1].at).toBe(T0 + 1000);
    });

    it("measures the gap between neighbours, not across the whole run", () => {
      // 45 s apart each: the run spans 90 s but no single step exceeds 60 s.
      const entries = feed([
        ["ann", "Drew a card", 0],
        ["ann", "Drew a card", 45],
        ["ann", "Drew a card", 90],
      ]);
      expect(labels(entries)).toEqual(["ann: Drew a card ×3"]);
    });

    it("honours a custom gap, and Infinity never breaks on time", () => {
      const entries = feed([
        ["ann", "Drew a card", 0],
        ["ann", "Drew a card", 10],
        ["ann", "Drew a card", 100_000],
      ]);
      expect(labels(entries, 5_000)).toHaveLength(3);
      expect(labels(entries, Infinity)).toEqual(["ann: Drew a card ×3"]);
    });
  });

  describe("dice", () => {
    it("groups single-die rolls of the same die and keeps every value, in roll order", () => {
      const groups = groupActionLog(
        feed([
          ["ann", "Rolled d20 → 17"],
          ["ann", "Rolled d20 → 4"],
          ["ann", "Rolled d20 → 12"],
        ]),
      );
      expect(groups).toHaveLength(1);
      expect(groups[0].values).toEqual(["17", "4", "12"]);
      expect(groupLabel(groups[0])).toBe("Rolled d20 ×3 → 17, 4, 12");
      expect(groupLabelParts(groups[0])).toEqual({
        base: "Rolled d20",
        count: "×3",
        detail: "→ 17, 4, 12",
      });
    });

    it("keeps repeated values: two 6s are two rolls", () => {
      const [group] = groupActionLog(feed([["ann", "Rolled d6 → 6"], ["ann", "Rolled d6 → 6"]]));
      expect(groupLabel(group)).toBe("Rolled d6 ×2 → 6, 6");
    });

    it("renders a lone roll exactly as it was logged", () => {
      const [group] = groupActionLog(feed([["ann", "Rolled d20 → 17"]]));
      expect(groupLabel(group)).toBe("Rolled d20 → 17");
    });

    it("does not mix different dice", () => {
      expect(
        labels(
          feed([
            ["ann", "Rolled d20 → 17"],
            ["ann", "Rolled d6 → 3"],
            ["ann", "Rolled d6 → 5"],
          ]),
        ),
      ).toEqual(["ann: Rolled d6 ×2 → 3, 5", "ann: Rolled d20 → 17"]);
    });

    it("leaves multi-dice rolls ungrouped, values intact", () => {
      expect(
        labels(
          feed([
            ["ann", "Rolled 2d6 → 3, 4 = 7"],
            ["ann", "Rolled 2d6 → 1, 1 = 2"],
          ]),
        ),
      ).toEqual(["ann: Rolled 2d6 → 1, 1 = 2", "ann: Rolled 2d6 → 3, 4 = 7"]);
    });

    it("still groups a multi-dice roll that repeats exactly, as identical text", () => {
      expect(
        labels(feed([["ann", "Rolled 2d6 → 3, 4 = 7"], ["ann", "Rolled 2d6 → 3, 4 = 7"]])),
      ).toEqual(["ann: Rolled 2d6 → 3, 4 = 7 ×2"]);
    });

    it("breaks a dice run on another player and on the time gap", () => {
      expect(
        labels(
          feed([
            ["ann", "Rolled d20 → 1", 0],
            ["bob", "Rolled d20 → 2", 1],
            ["ann", "Rolled d20 → 3", 2],
            ["ann", "Rolled d20 → 4", 200],
          ]),
        ),
      ).toEqual([
        "ann: Rolled d20 → 4",
        "ann: Rolled d20 → 3",
        "bob: Rolled d20 → 2",
        "ann: Rolled d20 → 1",
      ]);
    });
  });

  describe("lines that name cards", () => {
    it("never folds different cards together", () => {
      const rows: Array<[string, string]> = [
        ["ann", "Boosted from deck: Feint (boost 2)"],
        ["ann", "Boosted from deck: Regroup (boost 1)"],
        ["ann", "Milled Feint"],
        ["ann", "Milled Skirmish"],
        ["ann", "Revealed their hand (2): Feint, Skirmish"],
        ["ann", "Revealed their hand (2): Feint, Regroup"],
        ["ann", "Randomly discarded Feint"],
        ["ann", "Randomly discarded Regroup"],
      ];
      const groups = groupActionLog(feed(rows));
      expect(groups.map(groupLabel)).toEqual(rows.map(([, text]) => text).reverse());
      expect(groups.every((g) => g.count === 1)).toBe(true);
    });

    it("keeps the full text when the very same line repeats", () => {
      const [group] = groupActionLog(
        feed([
          ["ann", "Boosted from deck: Feint (boost 2)"],
          ["ann", "Boosted from deck: Feint (boost 2)"],
        ]),
      );
      expect(groupLabel(group)).toBe("Boosted from deck: Feint (boost 2) ×2");
    });
  });

  describe("log cap", () => {
    const draws = (n: number, firstSeq = 1): SandboxLogEntry[] =>
      Array.from({ length: n }, (_, i) => ({
        key: `ann-${firstSeq + i}`,
        player: "ann",
        at: T0 + (firstSeq + i) * 1000,
        text: "Drew a card",
      })).reverse();

    it("is an exact count below the buffer size", () => {
      const [group] = groupActionLog(draws(24));
      expect(group.capped).toBe(false);
      expect(groupLabel(group)).toBe("Drew a card ×24");
      expect(group.key).toBe("ann-1");
    });

    it("says 'or more' once the run fills the buffer", () => {
      const [group] = groupActionLog(draws(25));
      expect(group.capped).toBe(true);
      expect(groupLabel(group)).toBe("Drew a card ×25+");
    });

    it("keeps one identity while the buffer rolls under it", () => {
      // The 26th and 27th draw each push the oldest entry out.
      const keys = [draws(25, 1), draws(25, 2), draws(25, 3)].map((e) => groupActionLog(e)[0].key);
      expect(new Set(keys).size).toBe(1);
    });

    it("keeps capped groups of different players apart", () => {
      const ann = draws(25);
      const bob = ann.map((e) => ({ ...e, key: e.key.replace("ann", "bob"), player: "bob", at: e.at + 60_000 }));
      const groups = groupActionLog([...bob, ...ann]);
      expect(groups.map((g) => `${g.player}: ${groupLabel(g)}`)).toEqual([
        "bob: Drew a card ×25+",
        "ann: Drew a card ×25+",
      ]);
      expect(new Set(groups.map((g) => g.key)).size).toBe(2);
    });

    it("keeps every dice value it still has", () => {
      const rolls = draws(25).map((e, i) => ({ ...e, text: `Rolled d6 → ${(i % 6) + 1}` }));
      const [group] = groupActionLog(rolls);
      expect(group.values).toHaveLength(25);
      expect(groupLabel(group).startsWith("Rolled d6 ×25+ → ")).toBe(true);
    });

    it("honours a custom buffer size", () => {
      expect(groupLabel(groupActionLog(draws(3), GROUP_GAP_MS, 3)[0])).toBe("Drew a card ×3+");
    });
  });

  it("does not mutate its input", () => {
    const entries = feed([["ann", "Drew a card"], ["ann", "Drew a card"], ["ann", "Rolled d6 → 2"]]);
    const snapshot = JSON.parse(JSON.stringify(entries));
    groupActionLog(entries);
    expect(entries).toEqual(snapshot);
  });

  it("accounts for every entry exactly once, in feed order", () => {
    const entries = feed([
      ["ann", "Drew a card"],
      ["ann", "Drew a card"],
      ["bob", "Rolled d20 → 9"],
      ["bob", "Rolled d20 → 11"],
      ["ann", "Discarded a card"],
      ["ann", "Drew a card", 500],
    ]);
    const groups = groupActionLog(entries);
    expect(groups.flatMap((g) => g.entries)).toEqual(entries);
    expect(groups.reduce((n, g) => n + g.count, 0)).toBe(entries.length);
  });

  it("works on mergeActionLog output without changing the stored log", () => {
    const players = {
      ann: {
        actionLog: [
          { seq: 1, at: T0, text: "Drew a card" },
          { seq: 2, at: T0 + 1000, text: "Drew a card" },
          { seq: 3, at: T0 + 3000, text: "Drew a card" },
        ],
      },
      bob: { actionLog: [{ seq: 1, at: T0 + 2000, text: "Drew a card" }] },
    };
    const stored = JSON.parse(JSON.stringify(players));
    expect(labels(mergeActionLog(players))).toEqual([
      "ann: Drew a card",
      "bob: Drew a card",
      "ann: Drew a card ×2",
    ]);
    expect(players).toEqual(stored);
  });
});
