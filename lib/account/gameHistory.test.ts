/**
 * The history transport (#573) has one job beyond fetching: never let an
 * absent or unhappy accounts API become an error the player has to read. These
 * pin the status→reason mapping (especially 503, which is what an unconfigured
 * telemetry link answers and therefore the NORMAL state of a self-hosted
 * build), the defensive normalization of a payload full of nullable columns,
 * and the row-label helpers the list renders from.
 */
import {
  endConditionLabel,
  fetchAccountGames,
  formatDuration,
  gameOutcome,
  heroLabel,
  mapLabel,
  normalizeGamesPage,
  opponentLabel,
  pilotLabel,
  relativeDate,
  type AccountGame,
} from "./gameHistory";
import { API_URL } from "./apiUrl";

const reply = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

const GAME = {
  id: "live-abc-1-deadbeef",
  endedAt: "2026-08-05T12:00:00.000Z",
  map: "mended-drum",
  turns: 14,
  durationSeconds: 733,
  endCondition: "hp_zero",
  draw: false,
  you: { heroId: "thrall", heroName: "Thrall", won: true, finalHealth: 4 },
  opponents: [
    { heroId: "king-kong", heroName: "King Kong", pilot: "bot:hard", botDifficulty: "hard" },
  ],
};

let fetchMock: jest.Mock;

beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("fetchAccountGames", () => {
  it("asks for one page with credentials and no player id", async () => {
    fetchMock.mockResolvedValue(reply(200, { games: [GAME], nextBefore: "c1" }));

    const result = await fetchAccountGames();

    expect(result).toEqual({
      ok: true,
      value: { games: [GAME], nextBefore: "c1" },
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_URL}/me/games?limit=20`);
    expect(init.credentials).toBe("include");
    // The session cookie decides whose games these are — a player id in the
    // query would be a way to read someone else's history.
    expect(url).not.toContain("player");
  });

  it("passes the opaque cursor through verbatim", async () => {
    fetchMock.mockResolvedValue(reply(200, { games: [], nextBefore: null }));

    await fetchAccountGames({ limit: 5, before: "cursor+with/chars" });

    expect(fetchMock.mock.calls[0][0]).toBe(
      `${API_URL}/me/games?limit=5&before=cursor%2Bwith%2Fchars`,
    );
  });

  it("maps 503 (telemetry not configured) to a calm 'unavailable'", async () => {
    fetchMock.mockResolvedValue(
      reply(503, { error: "telemetry_not_configured" }),
    );

    expect(await fetchAccountGames()).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("distinguishes an expired session and a rate limit", async () => {
    fetchMock.mockResolvedValueOnce(reply(401, { error: "unauthorized" }));
    expect(await fetchAccountGames()).toEqual({
      ok: false,
      reason: "unauthorized",
    });

    fetchMock.mockResolvedValueOnce(reply(429, { error: "rate_limited" }));
    expect(await fetchAccountGames()).toEqual({
      ok: false,
      reason: "rate_limited",
    });
  });

  it("never throws when the API is unreachable or answers junk", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await fetchAccountGames()).toEqual({
      ok: false,
      reason: "unavailable",
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("not json");
      },
    } as unknown as Response);
    expect(await fetchAccountGames()).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });
});

describe("normalizeGamesPage", () => {
  it("survives a payload where every nullable column is null", () => {
    const page = normalizeGamesPage({
      games: [
        {
          id: "g1",
          endedAt: "2026-08-05T12:00:00.000Z",
          map: null,
          turns: null,
          durationSeconds: null,
          endCondition: null,
          draw: false,
          you: { heroId: null, heroName: null, won: false, finalHealth: null },
          opponents: null,
        },
      ],
      nextBefore: null,
    });

    expect(page.games[0]).toEqual({
      id: "g1",
      endedAt: "2026-08-05T12:00:00.000Z",
      map: "",
      turns: null,
      durationSeconds: null,
      endCondition: null,
      draw: false,
      you: { heroId: null, heroName: null, won: false, finalHealth: null },
      opponents: [],
    });
  });

  it("drops rows with no id and treats a non-page body as no history", () => {
    expect(normalizeGamesPage({ games: [{ endedAt: "x" }] }).games).toEqual([]);
    expect(normalizeGamesPage({ error: "boom" })).toEqual({
      games: [],
      nextBefore: null,
    });
    expect(normalizeGamesPage(null)).toEqual({ games: [], nextBefore: null });
  });
});

describe("row labels", () => {
  const game = GAME as AccountGame;

  it("treats a draw as a property of the game, not the seat", () => {
    expect(gameOutcome(game)).toBe("win");
    expect(gameOutcome({ ...game, you: { ...game.you, won: false } })).toBe(
      "loss",
    );
    // Both flags set (a producer could) — the draw wins.
    expect(gameOutcome({ ...game, draw: true })).toBe("draw");
  });

  it("labels bot opponents by tier and leaves humans unqualified", () => {
    // Telemetry stores the bot ID in `pilot` ("bot:hard"), never a bare "bot"
    // — the shape a live /me/games page actually returns.
    expect(pilotLabel(game.opponents[0])).toBe("Hard bot");
    expect(
      pilotLabel({ ...game.opponents[0], pilot: "bot:expert", botDifficulty: "expert" }),
    ).toBe("Expert bot");
    // No tier column: fall back to the bot id when it names a known tier…
    expect(
      pilotLabel({ ...game.opponents[0], pilot: "bot:medium", botDifficulty: null }),
    ).toBe("Medium bot");
    // …and stay generic when it doesn't.
    expect(
      pilotLabel({ ...game.opponents[0], pilot: "bot:gruncle-v2", botDifficulty: null }),
    ).toBe("Bot");
    expect(
      pilotLabel({ ...game.opponents[0], pilot: "human", botDifficulty: null }),
    ).toBeNull();
    expect(
      pilotLabel({ ...game.opponents[0], pilot: "llm:sonnet", botDifficulty: null }),
    ).toBe("LLM · sonnet");
    expect(opponentLabel(game.opponents[0])).toBe("King Kong (Hard bot)");
  });

  it("falls back through heroName → heroId → a neutral word", () => {
    expect(heroLabel({ heroId: "thrall", heroName: "Thrall" })).toBe("Thrall");
    expect(heroLabel({ heroId: "thrall", heroName: null })).toBe("thrall");
    expect(heroLabel({ heroId: null, heroName: null })).toBe("Unknown hero");
  });

  it("resolves known boards to their catalog title and echoes unknown ids", () => {
    expect(mapLabel("mended-drum")).toBe("The Mended Drum");
    expect(mapLabel("some-custom-board")).toBe("some-custom-board");
    expect(mapLabel("")).toBe("Unknown board");
  });

  it("formats durations and end conditions for scanning", () => {
    expect(formatDuration(733)).toBe("12m 13s");
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(3_845)).toBe("1h 04m");
    expect(formatDuration(null)).toBeNull();
    expect(endConditionLabel("hp_zero")).toBe("hp zero");
    expect(endConditionLabel(null)).toBeNull();
  });

  it("reads relative until a month out, then a plain date", () => {
    const now = Date.parse("2026-08-06T12:00:00.000Z");
    const ago = (ms: number) => new Date(now - ms).toISOString();

    expect(relativeDate(ago(30_000), now)).toBe("just now");
    expect(relativeDate(ago(20 * 60_000), now)).toBe("20m ago");
    expect(relativeDate(ago(5 * 3_600_000), now)).toBe("5h ago");
    expect(relativeDate(ago(26 * 3_600_000), now)).toBe("yesterday");
    expect(relativeDate(ago(9 * 86_400_000), now)).toBe("9d ago");
    expect(relativeDate(ago(200 * 86_400_000), now)).toBe("2026-01-18");
    expect(relativeDate("not a date", now)).toBe("");
  });
});
