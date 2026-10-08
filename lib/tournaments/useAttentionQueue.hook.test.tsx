/**
 * The event page's attention queue refreshes when the page's poll brings
 * matches that changed, never merely because the poll handed over a new array;
 * a failed refresh keeps the last good queue.
 */
import { act, renderHook } from "@testing-library/react";

import { useAttentionQueue, useKeepLastGood, type Loaded } from "./hooks";
import * as api from "./api";

jest.mock("./api", () => ({ getAttention: jest.fn() }));
const get = api.getAttention as jest.Mock;

const flush = () => act(async () => {});
const matches = (status: string) => [{ id: "m1", status, winnerEntry: null }];

beforeEach(() => get.mockReset().mockResolvedValue({ ok: true, value: [] }));

it("a poll's new but unchanged matches array asks nothing; a changed match refreshes once", async () => {
  const { rerender } = renderHook(({ m }) => useAttentionQueue("s", true, m), { initialProps: { m: matches("open") } });
  await flush();
  expect(get).toHaveBeenCalledTimes(1);
  for (let i = 0; i < 3; i++) {
    rerender({ m: matches("open") });
    await flush();
  }
  expect(get).toHaveBeenCalledTimes(1);
  rerender({ m: matches("decided") });
  await flush();
  expect(get).toHaveBeenCalledTimes(2);
});

it("a failed refresh keeps the last good queue", async () => {
  const item = { kind: "dispute", matchId: "m1" };
  get.mockResolvedValueOnce({ ok: true, value: [item] }).mockResolvedValueOnce({ ok: false, reason: "unavailable" });
  const { result, rerender } = renderHook(({ m }) => useAttentionQueue("s", true, m), { initialProps: { m: matches("open") } });
  await flush();
  rerender({ m: matches("decided") });
  await flush();
  expect(get).toHaveBeenCalledTimes(2);
  expect(result.current[0]).toEqual({ status: "ready", value: [item] });
});

describe("useKeepLastGood", () => {
  const ready = (v: number): Loaded<number> => ({ status: "ready", value: v });
  it("keeps the last ready value of the same key when told to, never another key's", () => {
    const { result, rerender } = renderHook(({ l, k }) => useKeepLastGood(l, k, (s) => s === "unavailable"), {
      initialProps: { l: ready(1), k: "a" },
    });
    rerender({ l: { status: "unavailable" }, k: "a" });
    expect(result.current).toEqual(ready(1));
    rerender({ l: { status: "not_found" }, k: "a" });
    expect(result.current).toEqual({ status: "not_found" });
    rerender({ l: { status: "unavailable" }, k: "b" });
    expect(result.current).toEqual({ status: "unavailable" });
  });
});
