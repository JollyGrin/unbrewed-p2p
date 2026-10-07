/** Why a tagged game ended: asked at most twice, 5 s apart, and kept once the api knows. */
import { act, renderHook } from "@testing-library/react";

import { useTaggedGameEndReason } from "./TournamentGameNotes";
import * as api from "@/lib/tournaments/api";

jest.mock("../../lib/tournaments/api", () => ({ getMatch: jest.fn() }));
const get = api.getMatch as jest.Mock;

const AT = { slug: "s", matchId: "m" } as never;
const game = (finished: boolean) => ({
  ok: true,
  value: { match: { games: [{ roomId: "R", finishedAt: finished ? "2026-10-07T12:00:00Z" : null, endReason: "disconnect" }] } },
});
const elapse = (ms: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });

beforeEach(() => {
  jest.useFakeTimers();
  get.mockReset();
});
afterEach(() => jest.useRealTimers());

it("asks again 5 s after the api didn't know yet, and keeps the answer", async () => {
  get.mockResolvedValueOnce(game(false)).mockResolvedValueOnce(game(true));
  const { result } = renderHook(() => useTaggedGameEndReason(AT, "R", true));
  await elapse(0);
  expect(get).toHaveBeenCalledTimes(1);
  expect(result.current).toBeNull();
  await elapse(5_000);
  expect(get).toHaveBeenCalledTimes(2);
  expect(result.current).toBe("disconnect");
  await elapse(60_000);
  expect(get).toHaveBeenCalledTimes(2);
});

it("gives up after two asks, a failed ask counting as one, without backing off", async () => {
  get.mockRejectedValueOnce(new Error("down")).mockResolvedValue(game(false));
  const { result } = renderHook(() => useTaggedGameEndReason(AT, "R", true));
  await elapse(0);
  await elapse(5_000);
  expect(get).toHaveBeenCalledTimes(2);
  await elapse(60_000);
  expect(get).toHaveBeenCalledTimes(2);
  expect(result.current).toBeNull();
});

it("asks nothing before the game is over", async () => {
  renderHook(() => useTaggedGameEndReason(AT, "R", false));
  await elapse(10_000);
  expect(get).not.toHaveBeenCalled();
});
