/**
 * `/me/quests` fetch layer + the `daily` block reader (#1658). The API ships
 * after this client, so the pins that matter are the quiet ones: a 404, a 503
 * and a junk body must all read as "nothing to show", never as an error.
 */
import { API_URL } from "./apiUrl";
import { QUEST_FIXTURES, QUESTS_NOW_MS, QUESTS_RESETS_AT } from "./fixtures/quests";
import {
  allDone,
  doneCount,
  fetchQuests,
  isEmptyBoard,
  normalizeDaily,
  normalizeQuestBoard,
  progressLabel,
  questActionLabel,
  questHref,
  resetCountdown,
  rewardLabel,
  streakChipLabel,
} from "./quests";
import { normalizeStats } from "./stats";

const reply = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

let fetchMock: jest.Mock;
beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("normalizeQuestBoard", () => {
  it("reads the contract shape in the API's order", () => {
    const board = normalizeQuestBoard(QUEST_FIXTURES.halfDone.quests);
    expect(board.starter.map((q) => q.id)).toEqual([
      "first-game",
      "first-win",
      "upgrade-card",
      "harder-bot",
      "play-human",
      "three-heroes",
    ]);
    expect(board.daily.map((q) => [q.id, q.done])).toEqual([
      ["play-today", true],
      ["win-today", false],
    ]);
    expect(board.resetsAt).toBe(QUESTS_RESETS_AT);
    expect(doneCount(board.starter)).toBe(3);
    expect(allDone(board.starter)).toBe(false);
    expect(board.starter[5].progress).toEqual({ current: 2, target: 3 });
  });

  it("degrades junk to an empty board rather than throwing", () => {
    for (const body of [null, undefined, "nope", 42, [], { starter: "x", daily: null }]) {
      const board = normalizeQuestBoard(body);
      expect(isEmptyBoard(board)).toBe(true);
      expect(board.resetsAt).toBeNull();
    }
  });

  it("drops rows without an id and duplicate ids, keeps a row with no text", () => {
    const board = normalizeQuestBoard({
      starter: [{ title: "no id" }, { id: "a" }, { id: "a", title: "again" }, null],
      daily: [],
      resetsAt: "not a date",
    });
    expect(board.starter).toEqual([
      { id: "a", title: "a", description: "", reward: null, progress: { current: 0, target: 1 }, done: false },
    ]);
    expect(board.resetsAt).toBeNull();
  });

  it("clamps progress into its target and fills a done quest", () => {
    const board = normalizeQuestBoard({
      starter: [
        { id: "over", progress: { current: 7, target: 3 }, done: false },
        { id: "done", progress: { current: 0, target: 3 }, done: true },
        { id: "zero", progress: { current: -2, target: 0 }, done: false },
      ],
    });
    expect(board.starter.map((q) => q.progress)).toEqual([
      { current: 3, target: 3 },
      { current: 3, target: 3 },
      { current: 0, target: 1 },
    ]);
    // `done` is the API's verdict: full progress alone never flips it.
    expect(board.starter[0].done).toBe(false);
  });

  it("treats an empty reward as no reward", () => {
    const board = normalizeQuestBoard({
      starter: [
        { id: "a", reward: {} },
        { id: "b", reward: { xp: 0 } },
        { id: "c", reward: { xp: 30, heroPoints: 50 } },
        { id: "d", reward: { note: "+50 hero points per new hero" } },
      ],
    });
    expect(board.starter.map((q) => rewardLabel(q.reward))).toEqual([
      null,
      null,
      "+30 XP · +50 hero points",
      "+50 hero points per new hero",
    ]);
  });
});

describe("normalizeDaily", () => {
  it("reads the contract block", () => {
    expect(normalizeDaily(QUEST_FIXTURES.halfDone.daily)).toEqual({
      streak: 3,
      bestStreak: 5,
      playedToday: true,
      wonToday: false,
      playXpToday: 20,
      playXpTomorrow: 25,
      firstWinXp: 20,
      resetsAt: QUESTS_RESETS_AT,
    });
  });

  it("is null when absent or unusable — absent means no streak UI", () => {
    for (const raw of [undefined, null, {}, { streak: "3" }, { streak: -1 }, []]) {
      expect(normalizeDaily(raw)).toBeNull();
    }
  });

  it("rides /me/stats as an optional block", () => {
    expect(normalizeStats({ totalGames: 4 }).daily).toBeNull();
    expect(normalizeStats({ totalGames: 4, daily: QUEST_FIXTURES.dailyOpen.daily }).daily?.streak).toBe(2);
  });
});

describe("fetchQuests", () => {
  it("asks /me/quests with the session cookie", async () => {
    fetchMock.mockResolvedValue(reply(200, QUEST_FIXTURES.brandNew.quests));
    const result = await fetchQuests();
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/me/quests`,
      expect.objectContaining({ credentials: "include" }),
    );
    expect(result.ok && result.value.starter).toHaveLength(6);
  });

  it.each([
    [401, "unauthorized"],
    [429, "rate_limited"],
    [404, "unavailable"],
    [503, "unavailable"],
    [500, "unavailable"],
  ])("maps %i to %s", async (status, reason) => {
    fetchMock.mockResolvedValue(reply(status, {}));
    expect(await fetchQuests()).toEqual({ ok: false, reason });
  });

  it("never throws: a network error and a non-JSON body are unavailable", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await fetchQuests()).toEqual({ ok: false, reason: "unavailable" });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    });
    expect(await fetchQuests()).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("presentation helpers", () => {
  it("links each quest to where it is done", () => {
    expect(questHref("first-game")).toBe("/pro/game?vs=ai-easy");
    expect(questHref("harder-bot")).toBe("/pro/game?vs=ai-hard");
    expect(questHref("play-human")).toBe("/pro/game?quick=1");
    expect(questHref("upgrade-card")).toBe("/collection");
    // An id this build has never heard of still goes somewhere true.
    expect(questHref("some-future-quest")).toBe("/pro/game");
    expect(questActionLabel("first-game")).toBe("Play a bot");
    expect(questActionLabel("play-human")).toBe("Quick Play");
    expect(questActionLabel("upgrade-card")).toBe("Collection");
    expect(questActionLabel("play-today")).toBe("Play");
  });

  it("shows progress only for multi-step quests", () => {
    const board = normalizeQuestBoard(QUEST_FIXTURES.halfDone.quests);
    expect(progressLabel(board.starter[3])).toBeNull();
    expect(progressLabel(board.starter[5])).toBe("2/3");
  });

  it("counts down to the reset, and goes quiet once it has passed", () => {
    expect(resetCountdown(QUESTS_RESETS_AT, QUESTS_NOW_MS)).toBe("5h 12m");
    const at = Date.parse(QUESTS_RESETS_AT);
    expect(resetCountdown(QUESTS_RESETS_AT, at - 12 * 60_000)).toBe("12m");
    expect(resetCountdown(QUESTS_RESETS_AT, at - 20_000)).toBe("under a minute");
    expect(resetCountdown(QUESTS_RESETS_AT, at)).toBeNull();
    expect(resetCountdown(QUESTS_RESETS_AT, at + 1)).toBeNull();
    expect(resetCountdown(null, QUESTS_NOW_MS)).toBeNull();
    expect(resetCountdown("junk", QUESTS_NOW_MS)).toBeNull();
  });

  it("labels the streak chip from day 2 only", () => {
    const at = (streak: number) => normalizeDaily({ ...(QUEST_FIXTURES.brandNew.daily as object), streak });
    expect(streakChipLabel(null)).toBeNull();
    expect(streakChipLabel(at(0))).toBeNull();
    expect(streakChipLabel(at(1))).toBeNull();
    expect(streakChipLabel(at(2))).toBe("Day 2");
    expect(streakChipLabel(at(3))).toBe("Day 3");
  });
});
