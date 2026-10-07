/** Countdowns on the api's clock (p2p #1269): the `Date` header, guarded. */
import { act, renderHook } from "@testing-library/react";

import { getMatch } from "./api";
import { useNow } from "./hooks";
import { MAX_SKEW_MS, __resetServerClockForTests, noteResponseClock, noteServerDate, serverNow, serverOffset } from "./serverClock";

const realFetch = global.fetch;
const CLIENT = Date.parse("2026-10-07T12:00:00Z");

beforeEach(() => {
  __resetServerClockForTests();
  jest.useFakeTimers();
  jest.setSystemTime(CLIENT);
});
afterEach(() => {
  jest.useRealTimers();
  global.fetch = realFetch;
});

const answerWithDate = (date: string | null, age: string | null = null) => {
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    headers: { get: (h: string) => (h.toLowerCase() === "date" ? date : h.toLowerCase() === "age" ? age : null) },
    json: async () => ({ match: {}, tournament: {}, players: {} }),
  })) as unknown as typeof fetch;
};

it("each api response's Date header sets the offset: a phone 5 minutes slow counts down on server time", async () => {
  answerWithDate(new Date(CLIENT + 5 * 60_000).toUTCString());
  await getMatch("s", "m");
  expect(serverOffset()).toBe(5 * 60_000 + 500);
  expect(serverNow()).toBe(CLIENT + 5 * 60_000 + 500);
  const { result } = renderHook(() => useNow());
  expect(result.current).toBe(CLIENT + 5 * 60_000 + 500);
  await act(async () => {
    jest.advanceTimersByTime(1000);
  });
  expect(result.current).toBe(CLIENT + 5 * 60_000 + 1500);
});

it("no header (cross-origin without expose) falls back to the client clock", async () => {
  answerWithDate(null);
  await getMatch("s", "m");
  expect(serverOffset()).toBe(0);
  expect(serverNow()).toBe(CLIENT);
});

it("an absurd or unparsable header is ignored and keeps the last good offset", () => {
  noteServerDate(new Date(CLIENT + 60_000).toUTCString(), CLIENT);
  expect(serverOffset()).toBe(60_500);
  noteServerDate(new Date(CLIENT + MAX_SKEW_MS + 60_000).toUTCString(), CLIENT);
  noteServerDate("not a date", CLIENT);
  noteServerDate(new Date(0).toUTCString(), CLIENT);
  expect(serverOffset()).toBe(60_500);
});

it("a cached/proxied response (an Age header) never moves the clock (p2p #1269)", async () => {
  answerWithDate(new Date(CLIENT - 3_600_000).toUTCString(), "3600");
  await getMatch("s", "m");
  expect(serverOffset()).toBe(0);
  const headers = (date: string, age: string | null) => ({ get: (h: string) => (h === "Date" ? date : h === "Age" ? age : null) });
  noteResponseClock(headers(new Date(CLIENT + 60_000).toUTCString(), null), CLIENT);
  expect(serverOffset()).toBe(60_500);
  noteResponseClock(headers(new Date(CLIENT - 600_000).toUTCString(), "0"), CLIENT);
  expect(serverOffset()).toBe(60_500);
});
