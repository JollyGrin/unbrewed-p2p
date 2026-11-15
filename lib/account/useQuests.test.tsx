/**
 * The quests store (#1658): a guest costs nothing, the streak chip never asks
 * for quests, consumers share one request each, and a failed refresh leaves
 * what is on screen alone.
 */
import { act, renderHook, waitFor } from "@testing-library/react";

import { QUEST_FIXTURES } from "./fixtures/quests";
import { normalizeDaily, normalizeQuestBoard, type QuestsResult } from "./quests";
import type { StatsResult } from "./stats";
import {
  STALE_MS,
  __resetQuestsStoreForTests,
  ensureQuestsProbe,
  useDailyBonus,
  useQuests,
} from "./useQuests";

let mockAccountStatus = "signed-in";
jest.mock("./useAccount", () => ({
  useAccount: () => ({ status: mockAccountStatus, account: null }),
}));

const DOWN: QuestsResult = { ok: false, reason: "unavailable" };
let questReplies: QuestsResult[] = [];
let statsReplies: StatsResult[] = [];
jest.mock("./quests", () => ({
  ...jest.requireActual("./quests"),
  fetchQuests: jest.fn(async () => questReplies.shift() ?? { ok: false, reason: "unavailable" }),
}));
jest.mock("./stats", () => ({
  ...jest.requireActual("./stats"),
  fetchAccountStats: jest.fn(async () => statsReplies.shift() ?? { ok: false, reason: "unavailable" }),
}));
const { fetchQuests } = jest.requireMock("./quests") as { fetchQuests: jest.Mock };
const { fetchAccountStats } = jest.requireMock("./stats") as { fetchAccountStats: jest.Mock };

const board = (name: keyof typeof QUEST_FIXTURES): QuestsResult => ({
  ok: true,
  value: normalizeQuestBoard(QUEST_FIXTURES[name].quests),
});
const stats = (name: keyof typeof QUEST_FIXTURES | null): StatsResult =>
  ({
    ok: true,
    value: { daily: name ? normalizeDaily(QUEST_FIXTURES[name].daily) : null },
  }) as StatsResult;

beforeEach(() => {
  __resetQuestsStoreForTests();
  mockAccountStatus = "signed-in";
  questReplies = [];
  statsReplies = [];
  fetchQuests.mockClear();
  fetchAccountStats.mockClear();
});

afterEach(() => jest.useRealTimers());

it("a guest fires no request at all", async () => {
  mockAccountStatus = "guest";
  const { result } = renderHook(() => useQuests());
  await waitFor(() => expect(result.current.status).toBe("guest"));
  expect(fetchQuests).not.toHaveBeenCalled();
  expect(fetchAccountStats).not.toHaveBeenCalled();
});

it("stays loading while the account probe is in flight", () => {
  mockAccountStatus = "loading";
  const { result } = renderHook(() => useQuests());
  expect(result.current).toEqual({ status: "loading", board: null, daily: null });
  expect(fetchQuests).not.toHaveBeenCalled();
});

it("signed in: one quests request and one stats request, shared by every consumer", async () => {
  questReplies = [board("halfDone")];
  statsReplies = [stats("halfDone")];
  const a = renderHook(() => useQuests());
  const b = renderHook(() => useQuests());
  const chip = renderHook(() => useDailyBonus());
  await waitFor(() => expect(a.result.current.status).toBe("ready"));
  await waitFor(() => expect(chip.result.current?.streak).toBe(3));
  expect(b.result.current.board?.starter).toHaveLength(6);
  expect(a.result.current.daily?.streak).toBe(3);
  expect(fetchQuests).toHaveBeenCalledTimes(1);
  expect(fetchAccountStats).toHaveBeenCalledTimes(1);
});

it("the streak chip alone never asks for quests", async () => {
  statsReplies = [stats("dailyOpen")];
  const { result } = renderHook(() => useDailyBonus());
  await waitFor(() => expect(result.current?.streak).toBe(2));
  expect(fetchQuests).not.toHaveBeenCalled();
});

it("no quests payload (404/503) is a quiet unavailable; no daily block is null", async () => {
  questReplies = [DOWN];
  statsReplies = [stats(null)];
  const { result } = renderHook(() => useQuests());
  await waitFor(() => expect(result.current.status).toBe("unavailable"));
  expect(result.current.board).toBeNull();
  expect(result.current.daily).toBeNull();
});

it("a mount on stale data re-asks, and a failed refresh keeps the board", async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-11-15T12:00:00Z"));
  questReplies = [board("brandNew"), board("halfDone"), DOWN];
  await act(async () => {
    await ensureQuestsProbe();
  });
  // Fresh: a second ask is the same probe.
  await act(async () => {
    await ensureQuestsProbe();
  });
  expect(fetchQuests).toHaveBeenCalledTimes(1);

  jest.setSystemTime(Date.now() + STALE_MS + 1);
  const { result } = renderHook(() => useQuests());
  await act(async () => {
    await Promise.resolve();
  });
  expect(fetchQuests).toHaveBeenCalledTimes(2);
  expect(result.current.board?.starter[0].done).toBe(true);

  jest.setSystemTime(Date.now() + STALE_MS + 1);
  await act(async () => {
    await ensureQuestsProbe();
  });
  expect(fetchQuests).toHaveBeenCalledTimes(3);
  expect(result.current.status).toBe("ready");
  expect(result.current.board?.starter[0].done).toBe(true);
});

it("signing out forgets the previous account's quests", async () => {
  questReplies = [board("allDone")];
  statsReplies = [stats("allDone")];
  const { result, rerender } = renderHook(() => useQuests());
  await waitFor(() => expect(result.current.status).toBe("ready"));
  mockAccountStatus = "guest";
  rerender();
  await waitFor(() => expect(result.current.status).toBe("guest"));
  expect(result.current.board).toBeNull();
  expect(result.current.daily).toBeNull();
});
