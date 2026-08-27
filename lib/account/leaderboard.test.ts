/**
 * The leaderboard transport (#590).
 *
 * The board is the API's opinion, printed verbatim, so these pin what happens
 * when that opinion arrives damaged: a row nobody can be linked to, a duplicate
 * username, a wins count larger than the games it came out of, a missing rank.
 * None of them may become a hole in the table or a wrong number beside a name.
 */
import { API_URL } from "./apiUrl";
import { fetchLeaderboard, normalizeLeaderboard } from "./leaderboard";

const reply = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

const row = (over: Record<string, unknown> = {}) => ({
  rank: 1,
  username: "JollyGrin",
  avatarUrl: null,
  level: 12,
  xp: 3400,
  selectedBadge: "first-win",
  gamesPlayed: 123,
  wins: 45,
  ...over,
});

let fetchMock: jest.Mock;
beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("normalizeLeaderboard — the worn badge", () => {
  it("takes slot 1 off the ordered `selectedBadges` array (#718)", () => {
    // A player may wear three; the board shows the one they lead with, because
    // fifty dense rows with three discs each is noise where one is a fact.
    const board = normalizeLeaderboard({
      players: [row({ selectedBadges: ["veteran", "first-win"] })],
    });
    expect(board.players[0].selectedBadge).toBe("veteran");
  });

  it("falls back to the singular field an older API still sends", () => {
    const board = normalizeLeaderboard({ players: [row()] });
    expect(board.players[0].selectedBadge).toBe("first-win");
  });

  it("reads an empty array as wearing nothing", () => {
    const board = normalizeLeaderboard({
      players: [row({ selectedBadge: "first-win", selectedBadges: [] })],
    });
    expect(board.players[0].selectedBadge).toBeNull();
  });
});

describe("normalizeLeaderboard", () => {
  it("keeps the API's order and its ranks", () => {
    const board = normalizeLeaderboard({
      generatedAt: "2026-08-12T12:00:00.000Z",
      players: [row(), row({ rank: 2, username: "Emyrk", xp: 2100 })],
    });

    expect(board.generatedAt).toBe("2026-08-12T12:00:00.000Z");
    expect(board.players.map((p) => p.username)).toEqual(["JollyGrin", "Emyrk"]);
    expect(board.players.map((p) => p.rank)).toEqual([1, 2]);
  });

  it("falls back to position when a row has no rank", () => {
    const board = normalizeLeaderboard({
      players: [row({ rank: undefined }), row({ rank: undefined, username: "Emyrk" })],
    });
    expect(board.players.map((p) => p.rank)).toEqual([1, 2]);
  });

  it("drops a row that names nobody", () => {
    const board = normalizeLeaderboard({ players: [row({ username: null }), row()] });
    expect(board.players).toHaveLength(1);
  });

  it("keeps the first of a duplicated username", () => {
    // Two ranks linking to one profile is worse than one missing row.
    const board = normalizeLeaderboard({
      players: [row({ xp: 3400 }), row({ rank: 2, username: "jollygrin", xp: 10 })],
    });
    expect(board.players).toHaveLength(1);
    expect(board.players[0].xp).toBe(3400);
  });

  it("clamps wins into the games they came out of", () => {
    const board = normalizeLeaderboard({
      players: [row({ gamesPlayed: 10, wins: 99 })],
    });
    expect(board.players[0].wins).toBe(10);
  });

  it("keeps an absent level absent, and a zero level real", () => {
    expect(normalizeLeaderboard({ players: [row({ level: undefined })] }).players[0].level).toBeNull();
    expect(normalizeLeaderboard({ players: [row({ level: 0 })] }).players[0].level).toBe(0);
  });

  it("reads a body that isn't a board as an empty one", () => {
    expect(normalizeLeaderboard(null).players).toEqual([]);
    expect(normalizeLeaderboard({ players: "nope" }).players).toEqual([]);
  });
});

describe("fetchLeaderboard", () => {
  it("asks with a limit and no credentials", async () => {
    fetchMock.mockResolvedValue(reply(200, { players: [row()] }));

    const result = await fetchLeaderboard();

    expect(result).toMatchObject({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/leaderboard?limit=50`,
      expect.objectContaining({ credentials: "omit" }),
    );
  });

  it("folds every failure into a quiet reason", async () => {
    fetchMock.mockResolvedValue(reply(429, {}));
    expect(await fetchLeaderboard()).toEqual({ ok: false, reason: "rate_limited" });

    fetchMock.mockResolvedValue(reply(503, {}));
    expect(await fetchLeaderboard()).toEqual({ ok: false, reason: "unavailable" });

    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await fetchLeaderboard()).toEqual({ ok: false, reason: "unavailable" });
  });
});
