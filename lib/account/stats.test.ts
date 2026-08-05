/**
 * `GET /me/stats` transport + the pure numbers behind the page (#574).
 *
 * The two things that could actually mislead a player are pinned hardest:
 * a percentage computed off a sample too small to mean anything, and a section
 * that a newer client renders from a field its API never sent.
 */
import {
  fetchAccountStats,
  formatClock,
  headlineWinRate,
  MIN_WIN_RATE_GAMES,
  monthLabel,
  normalizeStats,
  percentLabel,
  recordLabel,
  winPercent,
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
