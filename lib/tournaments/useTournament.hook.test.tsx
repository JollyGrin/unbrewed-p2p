/** The event/bracket page polls while the tournament runs (E2, #1236). */
import { act, renderHook } from "@testing-library/react";

import { useTournament } from "./hooks";
import * as api from "./api";

jest.mock("./api", () => ({ getTournament: jest.fn() }));
const get = api.getTournament as jest.Mock;

const data = (status: string) => ({ ok: true, value: { tournament: { status }, entries: [], matches: [], standings: null } });
const tick = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};

beforeEach(() => {
  jest.useFakeTimers();
  get.mockReset();
});
afterEach(() => jest.useRealTimers());

it("re-fetches every 10s while running, and stops once complete", async () => {
  get.mockResolvedValue(data("running"));
  const { result } = renderHook(() => useTournament("s"));
  await tick(0);
  expect(get).toHaveBeenCalledTimes(1);
  await tick(10_000);
  expect(get).toHaveBeenCalledTimes(2);
  get.mockResolvedValue(data("complete"));
  await tick(10_000);
  expect(get).toHaveBeenCalledTimes(3);
  expect((result.current[0] as { value: { tournament: { status: string } } }).value.tournament.status).toBe("complete");
  await tick(30_000);
  expect(get).toHaveBeenCalledTimes(3);
});

it("does not poll a signup event, nor while the tab is hidden; a failed poll keeps the last data", async () => {
  get.mockResolvedValue(data("signup"));
  renderHook(() => useTournament("s"));
  await tick(30_000);
  expect(get).toHaveBeenCalledTimes(1);

  get.mockReset().mockResolvedValue(data("running"));
  const { result } = renderHook(() => useTournament("s2"));
  await tick(0);
  const vis = jest.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  await tick(20_000);
  expect(get).toHaveBeenCalledTimes(1);
  vis.mockReturnValue("visible");
  get.mockResolvedValue({ ok: false, reason: "unavailable" });
  await tick(10_000);
  expect(get).toHaveBeenCalledTimes(2);
  expect(result.current[0].status).toBe("ready");
});

it("refreshes at once when the tab becomes visible again; the last-good fallback is per slug", async () => {
  get.mockResolvedValue(data("running"));
  const { result, rerender } = renderHook(({ s }) => useTournament(s), { initialProps: { s: "a" } });
  await tick(0);
  expect(get).toHaveBeenCalledTimes(1);
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(get).toHaveBeenCalledTimes(2);
  get.mockResolvedValue({ ok: false, reason: "unavailable" });
  rerender({ s: "b" });
  await tick(0);
  await tick(0);
  expect(result.current[0].status).toBe("unavailable"); // not slug a's data
});
