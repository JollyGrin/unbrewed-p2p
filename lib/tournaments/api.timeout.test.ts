/** The shared `call` helper gives up after ~10s as a network failure (#1265); writes after 30s (#1269). */
import {
  WRITE_TIMEOUT_MESSAGE,
  __resetReseatCooldownsForTests,
  createTournament,
  getGameReplay,
  getMatch,
  getMatchTicket,
  joinTournament,
  listTournaments,
  noticedReseatCooldown,
  overrideMatch,
  readyForMatch,
} from "./api";

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

it("a write under the 30s write limit is never aborted: a 25s create/ready still lands", async () => {
  global.fetch = slowFetch(25_000, { slug: "x", tournament: { slug: "x" } });
  const p = createTournament({} as never);
  const q = readyForMatch("s", "m");
  await jest.advanceTimersByTimeAsync(25_000);
  const [a, b] = await Promise.all([p, q]);
  expect(a.ok).toBe(true);
  expect(b.ok !== undefined).toBe(true);
  expect((global.fetch as jest.Mock).mock.calls.every(([, init]) => init.signal.aborted === false)).toBe(true);
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

it("a hung write gives up after 30s with copy that says to check before retrying (#1269)", async () => {
  global.fetch = slowFetch(120_000, {});
  const p = overrideMatch("s", "m", { winnerEntry: "e1" });
  await jest.advanceTimersByTimeAsync(29_999);
  let settled = false;
  void p.then(() => (settled = true));
  await jest.advanceTimersByTimeAsync(0);
  expect(settled).toBe(false);
  await jest.advanceTimersByTimeAsync(1);
  await expect(p).resolves.toEqual({ ok: false, reason: "unavailable", code: "timeout", message: WRITE_TIMEOUT_MESSAGE });
});

it("a non-JSON 200 for the list is a failure, not an empty list (#1269)", async () => {
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => {
      throw new SyntaxError("Unexpected token <");
    },
  })) as unknown as typeof fetch;
  await expect(listTournaments()).resolves.toEqual({ ok: false, reason: "unavailable" });
});

it("409 reseat_cooldown from /ready or /ticket carries ticketsExpireAt and is remembered per match (#1269)", async () => {
  __resetReseatCooldownsForTests();
  const until = "2026-10-07T18:30:00Z";
  global.fetch = jest.fn(async () => ({
    ok: false,
    status: 409,
    json: async () => ({ error: "reseat_cooldown", ticketsExpireAt: until }),
  })) as unknown as typeof fetch;
  const r = await readyForMatch("s", "m1");
  expect(r).toMatchObject({ ok: false, reason: "conflict", code: "reseat_cooldown", ticketsExpireAt: until });
  expect(noticedReseatCooldown("m1")).toBe(until);
  expect(noticedReseatCooldown("m2")).toBeNull();
  await getMatchTicket("s", "m2");
  expect(noticedReseatCooldown("m2")).toBe(until);
});
