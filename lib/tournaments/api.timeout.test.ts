/** The shared `call` helper gives up after ~10s as a network failure (#1265). */
import { createTournament, getGameReplay, getMatch, joinTournament, readyForMatch } from "./api";

const realFetch = global.fetch;
beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.useRealTimers();
  global.fetch = realFetch;
});

/** A fetch that answers after `ms`, or rejects when its signal aborts first. */
const slowFetch = (ms: number, body: unknown) =>
  jest.fn(
    (_url: string, init?: RequestInit) =>
      new Promise((resolve, reject) => {
        const t = setTimeout(() => resolve({ ok: true, status: 200, json: async () => body }), ms);
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(t);
          reject(new DOMException("aborted", "AbortError"));
        });
      }),
  ) as unknown as typeof fetch;

it("a request with no answer after 10s resolves as unavailable", async () => {
  global.fetch = slowFetch(60_000, {});
  const p = getMatch("s", "m");
  await jest.advanceTimersByTimeAsync(10_000);
  await expect(p).resolves.toEqual({ ok: false, reason: "unavailable" });
});

it("a slow POST that answers under 10s still succeeds", async () => {
  global.fetch = slowFetch(9_000, { ok: true });
  const p = joinTournament("s");
  await jest.advanceTimersByTimeAsync(9_000);
  const r = await p;
  expect(r.ok).toBe(true);
});

it("a write answering at 60s still succeeds (the ceiling is 90s)", async () => {
  global.fetch = slowFetch(60_000, { slug: "x", tournament: { slug: "x" } });
  const p = createTournament({} as never);
  const q = readyForMatch("s", "m");
  await jest.advanceTimersByTimeAsync(60_000);
  const [a, b] = await Promise.all([p, q]);
  expect(a.ok).toBe(true);
  expect(b.ok).toBe(true);
});

it("a write with no answer at 90s aborts with the 'taking too long' message", async () => {
  global.fetch = slowFetch(600_000, {});
  const p = joinTournament("s");
  await jest.advanceTimersByTimeAsync(89_000);
  expect((global.fetch as jest.Mock).mock.calls[0][1].signal.aborted).toBe(false);
  await jest.advanceTimersByTimeAsync(1_000);
  await expect(p).resolves.toMatchObject({
    ok: false,
    reason: "unavailable",
    code: "timeout",
    message: expect.stringContaining("taking too long"),
  });
});

it("a large GET (replay) gets 30s, then times out as unavailable", async () => {
  global.fetch = slowFetch(25_000, { bundle: { a: 1 } });
  const ok = getGameReplay("s", "m", 0);
  await jest.advanceTimersByTimeAsync(25_000);
  expect((await ok).ok).toBe(true);

  global.fetch = slowFetch(120_000, {});
  const slow = getGameReplay("s", "m", 0);
  await jest.advanceTimersByTimeAsync(30_000);
  await expect(slow).resolves.toEqual({ ok: false, reason: "unavailable" });
});
