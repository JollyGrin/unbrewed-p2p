/** The match page's polling (#1265): visibility-aware, stops on 404/cancel, backs off on errors. */
import { act, renderHook } from "@testing-library/react";

import { useMatchDetail } from "./hooks";
import * as api from "./api";

jest.mock("./api", () => ({ getMatch: jest.fn() }));
const get = api.getMatch as jest.Mock;

const detail = (match: object = {}, tStatus = "running") => ({
  ok: true,
  value: { match: { status: "open", ...match }, tournament: { status: tStatus }, players: {}, readyChecks: [], liveRoom: null },
});
const fail = { ok: false, reason: "unavailable" };
const tick = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};

beforeEach(() => {
  jest.useFakeTimers();
  get.mockReset();
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

it("does not fetch while the tab is hidden, and fetches once when it becomes visible", async () => {
  get.mockResolvedValue(detail());
  renderHook(() => useMatchDetail("s", "m"));
  await tick(0);
  expect(get).toHaveBeenCalledTimes(1);
  const vis = jest.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  await tick(60_000);
  expect(get).toHaveBeenCalledTimes(1);
  vis.mockReturnValue("visible");
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(get).toHaveBeenCalledTimes(2);
});

it("two 404s in a row stop the polling; the first one alone does not", async () => {
  get.mockResolvedValue({ ok: false, reason: "not_found" });
  const { result } = renderHook(() => useMatchDetail("s", "m"));
  await tick(0);
  expect(result.current[0].status).toBe("not_found");
  await tick(10_000); // second 404
  expect(get).toHaveBeenCalledTimes(2);
  await tick(120_000);
  expect(get).toHaveBeenCalledTimes(2);
});

it("a transient 404 followed by success keeps polling", async () => {
  get.mockResolvedValueOnce({ ok: false, reason: "not_found" }).mockResolvedValue(detail());
  renderHook(() => useMatchDetail("s", "m"));
  await tick(0);
  await tick(10_000);
  expect(get).toHaveBeenCalledTimes(2);
  await tick(10_000);
  await tick(10_000);
  expect(get).toHaveBeenCalledTimes(4);
});

it("becoming visible refetches and restarts the clock (no second fetch moments later)", async () => {
  get.mockResolvedValue(detail());
  renderHook(() => useMatchDetail("s", "m"));
  await tick(0);
  await tick(9_000);
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(get).toHaveBeenCalledTimes(2);
  await tick(2_000); // the old interval would have fired at 10s
  expect(get).toHaveBeenCalledTimes(2);
  await tick(8_000);
  expect(get).toHaveBeenCalledTimes(3);
});

it("a cancelled match, or a cancelled tournament, stops the polling", async () => {
  get.mockResolvedValue(detail({ cancelled: true }));
  renderHook(() => useMatchDetail("s", "m"));
  await tick(0);
  await tick(60_000);
  expect(get).toHaveBeenCalledTimes(1);

  get.mockReset().mockResolvedValue(detail({}, "cancelled"));
  renderHook(() => useMatchDetail("s2", "m"));
  await tick(0);
  await tick(60_000);
  expect(get).toHaveBeenCalledTimes(1);
});

it("backs off on repeated errors (doubling, capped at 60s) and resets on success", async () => {
  get.mockResolvedValue(detail());
  renderHook(() => useMatchDetail("s", "m"));
  await tick(0);
  get.mockResolvedValue(fail);
  await tick(10_000); // 2nd call: first failure
  expect(get).toHaveBeenCalledTimes(2);
  await tick(19_999);
  expect(get).toHaveBeenCalledTimes(2);
  await tick(1); // +20s
  expect(get).toHaveBeenCalledTimes(3);
  await tick(40_000);
  expect(get).toHaveBeenCalledTimes(4);
  await tick(60_000); // capped
  expect(get).toHaveBeenCalledTimes(5);
  await tick(60_000);
  expect(get).toHaveBeenCalledTimes(6);
  get.mockResolvedValue(detail());
  await tick(60_000);
  expect(get).toHaveBeenCalledTimes(7);
  await tick(10_000); // success: back to 10s
  expect(get).toHaveBeenCalledTimes(8);
});
