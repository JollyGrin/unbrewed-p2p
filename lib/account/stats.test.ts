/**
 * `GET /me/stats` transport + the pure numbers behind the page (#574).
 *
 * The two things that could actually mislead a player are pinned hardest:
 * a percentage computed off a sample too small to mean anything, and a section
 * that a newer client renders from a field its API never sent.
 */
import {
  casualGamesNote,
  countedRecord,
  fetchAccountStats,
  formatClock,
  headlineWinRate,
  isCasualBot,
  orderedBotSplits,
  levelProgress,
  MIN_WIN_RATE_GAMES,
  monthLabel,
  normalizeStats,
  percentLabel,
  recordLabel,
  splitLosses,
  winPercent,
  xpForLevel,
} from "./stats";

const reply = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

/** The #52 base payload: totals and heroes, none of the enriched sections. */
const BASE = {
  totalGames: 9,
  wins: 5,
  losses: 3,
  draws: 1,
  firstGameAt: "2026-03-14T10:00:00.000Z",
  lastGameAt: "2026-08-01T21:30:00.000Z",
  byHero: [
    { heroId: "thrall", heroName: "Thrall", games: 6, wins: 4 },
    { heroId: "medusa", heroName: "Medusa", games: 3, wins: 1 },
  ],
};

describe("normalizeStats — degradation", () => {
  it("keeps every base field and nulls every section the API didn't send", () => {
    const stats = normalizeStats(BASE);

    expect(stats.totalGames).toBe(9);
    expect(stats.wins).toBe(5);
    expect(stats.byHero).toHaveLength(2);
    // Null, not an empty default: the UI has to be able to tell "not sent"
    // apart from "you have none", and only the first one hides a section.
    expect(stats.streaks).toBeNull();
    expect(stats.recentForm).toBeNull();
    expect(stats.byOpponentHero).toBeNull();
    expect(stats.byMap).toBeNull();
    expect(stats.byOpponentKind).toBeNull();
    expect(stats.firstPlayer).toBeNull();
    expect(stats.avgDurationSeconds).toBeNull();
    expect(stats.avgTurns).toBeNull();
  });

  it("reads the full enriched payload", () => {
    const stats = normalizeStats({
      ...BASE,
      avgDurationSeconds: 733.4,
      avgTurns: 13.6,
      streaks: { current: 2, best: 4 },
      recentForm: ["W", "W", "L", "D"],
      byOpponentHero: [
        { heroId: "batman", heroName: "Batman", games: 4, wins: 1 },
      ],
      byMap: [{ map: "mended-drum", games: 7, wins: 4 }],
      byOpponentKind: {
        human: { games: 5, wins: 3 },
        bots: [{ difficulty: "hard", games: 4, wins: 2 }],
      },
      firstPlayer: {
        first: { games: 5, wins: 4 },
        second: { games: 4, wins: 1 },
      },
    });

    expect(stats.streaks).toEqual({ current: 2, best: 4 });
    expect(stats.recentForm).toEqual(["W", "W", "L", "D"]);
    expect(stats.byOpponentHero?.[0].heroName).toBe("Batman");
    expect(stats.byMap?.[0].map).toBe("mended-drum");
    expect(stats.byOpponentKind?.bots[0].difficulty).toBe("hard");
    expect(stats.firstPlayer?.second.wins).toBe(1);
    expect(stats.avgTurns).toBeCloseTo(13.6);
  });

  it("survives a garbled body without throwing", () => {
    expect(normalizeStats(null).totalGames).toBe(0);
    expect(normalizeStats("nope").byHero).toEqual([]);
    expect(normalizeStats({ totalGames: "many", byHero: 7 }).byHero).toEqual([]);
    // A section that arrived as the wrong type is "not sent", not a crash.
    expect(normalizeStats({ streaks: 5, recentForm: "WWL" }).streaks).toBeNull();
    expect(normalizeStats({ recentForm: "WWL" }).recentForm).toBeNull();
  });

  it("drops junk rows and sorts what's left games-desc", () => {
    const stats = normalizeStats({
      byHero: [
        { heroId: "a", heroName: "A", games: 2, wins: 1 },
        { heroId: "b", heroName: "B", games: 9, wins: 3 },
        // Zero-game rows are producer artefacts, not statistics.
        { heroId: "c", heroName: "C", games: 0, wins: 0 },
        "garbage",
      ],
    });

    expect(stats.byHero.map((row) => row.heroId)).toEqual(["b", "a"]);
  });

  it("clamps impossible counts rather than rendering them", () => {
    const stats = normalizeStats({
      byHero: [{ heroId: "a", games: 3, wins: 99 }],
      streaks: { current: 40, best: 4 },
    });

    // More wins than games would print "3300%".
    expect(stats.byHero[0].wins).toBe(3);
    // A current run cannot be longer than the best run it is part of.
    expect(stats.streaks).toEqual({ current: 4, best: 4 });
  });

  it("keeps only real W/L/D letters in the form strip", () => {
    expect(normalizeStats({ recentForm: ["W", "x", 3, "D"] }).recentForm).toEqual(
      ["W", "D"],
    );
  });

  it("treats an empty opponent-kind envelope as absent", () => {
    expect(normalizeStats({ byOpponentKind: {} }).byOpponentKind).toBeNull();
    expect(
      normalizeStats({ byOpponentKind: { bots: [] }, firstPlayer: { first: {} } })
        .firstPlayer,
    ).toBeNull();
  });
});

describe("fetchAccountStats", () => {
  const install = (impl: () => Response | Promise<Response>) => {
    global.fetch = jest.fn(impl) as unknown as typeof fetch;
  };

  it("sends the cookie and no player id", async () => {
    const spy = jest.fn(async () => reply(200, BASE));
    install(spy);

    const result = await fetchAccountStats();

    expect(result).toMatchObject({ ok: true });
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/me\/stats$/);
    expect(init.credentials).toBe("include");
  });

  it("maps each failure to its reason without throwing", async () => {
    install(() => reply(401, {}));
    expect(await fetchAccountStats()).toEqual({
      ok: false,
      reason: "unauthorized",
    });

    install(() => reply(429, {}));
    expect(await fetchAccountStats()).toEqual({
      ok: false,
      reason: "rate_limited",
    });

    // The normal answer of a build with no telemetry link.
    install(() => reply(503, { error: "telemetry_not_configured" }));
    expect(await fetchAccountStats()).toEqual({
      ok: false,
      reason: "unavailable",
    });

    install(() => {
      throw new TypeError("Failed to fetch");
    });
    expect(await fetchAccountStats()).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("treats an unparseable 200 as unavailable, not as zero games", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("unexpected <");
      },
    })) as unknown as typeof fetch;

    expect(await fetchAccountStats()).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });
});

describe("win-rate small-sample guard", () => {
  it("dashes the headline until the sample is worth a percentage", () => {
    for (let games = 1; games < MIN_WIN_RATE_GAMES; games += 1) {
      const stats = normalizeStats({ totalGames: games, wins: games });
      expect(headlineWinRate(stats)).toBe("—");
    }
  });

  it("prints a percentage from the guard onwards", () => {
    expect(
      headlineWinRate(normalizeStats({ totalGames: 5, wins: 3, losses: 2 })),
    ).toBe("60%");
    expect(headlineWinRate(normalizeStats({ totalGames: 8, wins: 2 }))).toBe(
      "25%",
    );
  });

  it("counts draws in the denominator", () => {
    // 4 of 10 played, not 4 of 8 decided.
    expect(
      headlineWinRate(
        normalizeStats({ totalGames: 10, wins: 4, losses: 4, draws: 2 }),
      ),
    ).toBe("40%");
  });

  it("leaves table rows unguarded — the games column is right there", () => {
    expect(percentLabel({ games: 1, wins: 1 })).toBe("100%");
    expect(percentLabel({ games: 3, wins: 1 })).toBe("33%");
    expect(winPercent({ games: 0, wins: 0 })).toBeNull();
    expect(percentLabel({ games: 0, wins: 0 })).toBe("—");
  });

  it("says nothing at all for a player with no games", () => {
    expect(headlineWinRate(normalizeStats({}))).toBe("—");
    expect(recordLabel(normalizeStats(BASE))).toBe("5–3–1");
  });
});

describe("formatting", () => {
  it("renders durations as a clock", () => {
    expect(formatClock(733)).toBe("12:13");
    expect(formatClock(59)).toBe("0:59");
    expect(formatClock(3862)).toBe("1:04:22");
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(null)).toBeNull();
    expect(formatClock(-5)).toBeNull();
  });

  it("renders a start month, or nothing when there isn't one", () => {
    expect(monthLabel("2026-03-14T10:00:00.000Z")).toBe("Mar 2026");
    expect(monthLabel(null)).toBeNull();
    expect(monthLabel("whenever")).toBeNull();
  });
});

/**
 * Levels (#577). The API sends `{level, xp, xpForNext}` on the same payload, and
 * the bar is drawn WITHIN the current level — so the level's floor is the one
 * number this client recomputes from the published curve.
 */
describe("levels", () => {
  const withLevel = (over: Record<string, unknown>) =>
    normalizeStats({ ...BASE, ...over });

  it("hides itself entirely when the API didn't send the block", () => {
    // An API deployed before unbrewed-api#18: the expected case, not an error.
    const stats = normalizeStats(BASE);
    expect(stats.level).toBeNull();
    expect(stats.xp).toBeNull();
    expect(stats.xpForNext).toBeNull();
    expect(levelProgress(stats)).toBeNull();
  });

  it("hides itself when the block arrives half-written", () => {
    expect(levelProgress(withLevel({ level: 3, xp: 700 }))).toBeNull();
    expect(levelProgress(withLevel({ level: 3, xpForNext: 600 }))).toBeNull();
    expect(levelProgress(withLevel({ xp: 700, xpForNext: 600 }))).toBeNull();
    // Junk is the same as absent — never a bar drawn off a string.
    expect(
      levelProgress(withLevel({ level: "3", xp: 700, xpForNext: 600 })),
    ).toBeNull();
  });

  it("follows the API's published curve", () => {
    // 50·N·(N+1): level 1 = 100, level 5 = 1500, level 10 = 5500, 20 = 21000.
    expect(xpForLevel(0)).toBe(0);
    expect(xpForLevel(1)).toBe(100);
    expect(xpForLevel(5)).toBe(1500);
    expect(xpForLevel(10)).toBe(5500);
    expect(xpForLevel(20)).toBe(21000);
  });

  it("measures the bar across the CURRENT level, not the whole climb", () => {
    // Level 5 runs 1500 → 2100. 1800 is exactly half way.
    const progress = levelProgress(
      withLevel({ level: 5, xp: 1800, xpForNext: 2100 }),
    );
    expect(progress).toEqual({
      level: 5,
      xp: 1800,
      floor: 1500,
      next: 2100,
      percent: 50,
      toGo: 300,
    });
    // The lifetime ratio would have read 86% — near-full at every level, which
    // is exactly the reading this avoids.
  });

  it("draws a real bar at level 0", () => {
    // Level 0 is a player under 100 XP, NOT a missing field.
    const progress = levelProgress(withLevel({ level: 0, xp: 40, xpForNext: 100 }));
    expect(progress).toMatchObject({ level: 0, floor: 0, percent: 40, toGo: 60 });
  });

  it("is empty at a level's floor and full at its ceiling", () => {
    expect(levelProgress(withLevel({ level: 3, xp: 600, xpForNext: 800 }))).
      toMatchObject({ percent: 0, toGo: 200 });
    expect(levelProgress(withLevel({ level: 3, xp: 800, xpForNext: 800 }))).
      toMatchObject({ percent: 100, toGo: 0 });
  });

  it("clamps rather than drawing an absurd bar off a bad payload", () => {
    // xpForNext at or below the level's own floor would divide by zero.
    expect(
      levelProgress(withLevel({ level: 5, xp: 1800, xpForNext: 1500 })),
    ).toMatchObject({ percent: 100, toGo: 0 });
    // XP behind the level it claims: empty, never negative.
    expect(
      levelProgress(withLevel({ level: 5, xp: 200, xpForNext: 2100 })),
    ).toMatchObject({ percent: 0, toGo: 1900 });
    // A negative level reads as absent, not as a bar with a negative floor.
    expect(levelProgress(withLevel({ level: -2, xp: 10, xpForNext: 100 }))).toBeNull();
  });
});

// --- the counted record (issue #592) -----------------------------------------

/**
 * A payload with games in every tier. The totals are deliberately the sum of
 * ALL of it (30 games, 17–10–3) so the tests can show what the record drops.
 */
const TIERED = {
  totalGames: 30,
  wins: 17,
  losses: 10,
  draws: 3,
  byOpponentKind: {
    human: { games: 10, wins: 5, draws: 2 },
    bots: [
      { difficulty: "easy", games: 8, wins: 7, draws: 0 },
      { difficulty: "expert", games: 6, wins: 2, draws: 1 },
      { difficulty: "hard", games: 4, wins: 2, draws: 0 },
      { difficulty: "medium", games: 2, wins: 1, draws: 0 },
    ],
  },
};

describe("counted record — easy/medium are visible but never count", () => {
  it("sums human + hard + expert + unknown and leaves the casual tiers out", () => {
    const record = countedRecord(normalizeStats(TIERED));

    // 10 + 6 + 4 counted games; 5 + 2 + 2 wins; 2 + 1 + 0 draws.
    expect(record).toEqual({
      games: 20,
      wins: 9,
      losses: 8,
      draws: 3,
      casualGames: 10,
    });
  });

  it("counts the unknown tier — those games are unlabelled, not casual", () => {
    const record = countedRecord(
      normalizeStats({
        ...TIERED,
        byOpponentKind: {
          human: null,
          bots: [
            { difficulty: "unknown", games: 12, wins: 5, draws: 1 },
            { difficulty: "easy", games: 3, wins: 3, draws: 0 },
          ],
        },
      }),
    );
    expect(record).toMatchObject({ games: 12, wins: 5, losses: 6, draws: 1 });
  });

  it("treats a missing draws field as none rather than breaking the arithmetic", () => {
    // The pre-telemetry#58 shape: split rows with games/wins and nothing else.
    const record = countedRecord(
      normalizeStats({
        ...TIERED,
        byOpponentKind: {
          human: { games: 10, wins: 4 },
          bots: [
            { difficulty: "hard", games: 5, wins: 2 },
            { difficulty: "medium", games: 4, wins: 4 },
          ],
        },
      }),
    );
    // Undecided games land in the loss column: 15 games, 6 wins, 0 draws.
    expect(record).toEqual({
      games: 15,
      wins: 6,
      losses: 9,
      draws: 0,
      casualGames: 4,
    });
    expect(splitLosses({ games: 5, wins: 2 })).toBe(3);
  });

  it("never lets a bad row push losses below zero", () => {
    expect(splitLosses({ games: 3, wins: 3, draws: 2 })).toBe(0);
    // The clamp is in the normaliser too: draws can't exceed the games left.
    const stats = normalizeStats({
      byOpponentKind: { human: { games: 3, wins: 3, draws: 2 }, bots: [] },
    });
    expect(stats.byOpponentKind?.human).toEqual({ games: 3, wins: 3, draws: 0 });
  });

  it("keeps telemetry's own totals when there is nothing to exclude", () => {
    // No byOpponentKind at all — the pre-split API. The degradation contract:
    // the headline is exactly what it was before this ticket.
    expect(countedRecord(normalizeStats(BASE))).toBeNull();
    expect(recordLabel(normalizeStats(BASE))).toBe("5–3–1");
    expect(casualGamesNote(normalizeStats(BASE))).toBeNull();

    // Splits present, but no casual games in them.
    const clean = normalizeStats({
      ...BASE,
      byOpponentKind: {
        human: { games: 6, wins: 4, draws: 1 },
        bots: [{ difficulty: "expert", games: 3, wins: 1, draws: 0 }],
      },
    });
    expect(countedRecord(clean)).toBeNull();
    expect(recordLabel(clean)).toBe("5–3–1");
  });

  it("drives the headline record and win rate off the counted games", () => {
    const stats = normalizeStats(TIERED);
    // 17–10–3 lifetime, 9–8–3 once the farmed easy wins come out.
    expect(recordLabel(stats)).toBe("9–8–3");
    expect(headlineWinRate(stats)).toBe("45%");
  });

  it("keeps the small-sample guard on the counted games, not the played ones", () => {
    // 20 games played, but only 4 of them count — still too few to rate.
    const stats = normalizeStats({
      totalGames: 20,
      wins: 18,
      byOpponentKind: {
        human: null,
        bots: [
          { difficulty: "easy", games: 16, wins: 16, draws: 0 },
          { difficulty: "hard", games: 4, wins: 2, draws: 0 },
        ],
      },
    });
    expect(headlineWinRate(stats)).toBe("—");
    expect(recordLabel(stats)).toBe("2–2–0");
  });

  it("explains the gap in one line, pluralised", () => {
    expect(casualGamesNote(normalizeStats(TIERED))).toBe(
      "10 casual bot games (easy/medium) not counted",
    );
    expect(
      casualGamesNote(
        normalizeStats({
          byOpponentKind: {
            human: { games: 4, wins: 2 },
            bots: [{ difficulty: "medium", games: 1, wins: 1 }],
          },
        }),
      ),
    ).toBe("1 casual bot game (easy/medium) not counted");
  });
});

describe("opposition ordering", () => {
  it("puts the tiers that count first, hardest down, and the casual pair last", () => {
    const stats = normalizeStats(TIERED);
    expect(
      orderedBotSplits(stats.byOpponentKind?.bots ?? []).map(
        (bot) => bot.difficulty,
      ),
    ).toEqual(["expert", "hard", "medium", "easy"]);
  });

  it("sorts an unnamed tier with unknown — counted, in the middle", () => {
    const stats = normalizeStats({
      byOpponentKind: {
        human: null,
        bots: [
          { difficulty: "easy", games: 9, wins: 9 },
          { difficulty: "brutal", games: 2, wins: 0 },
          { difficulty: "unknown", games: 5, wins: 1 },
          { difficulty: "expert", games: 1, wins: 0 },
        ],
      },
    });
    const bots = stats.byOpponentKind?.bots ?? [];
    expect(orderedBotSplits(bots).map((bot) => bot.difficulty)).toEqual([
      "expert",
      // Same rank as unknown, so games-desc breaks the tie.
      "unknown",
      "brutal",
      "easy",
    ]);
    expect(bots.filter(isCasualBot).map((bot) => bot.difficulty)).toEqual([
      "easy",
    ]);
  });
});
