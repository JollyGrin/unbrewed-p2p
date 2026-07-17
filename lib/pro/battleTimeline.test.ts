import { act, renderHook } from "@testing-library/react";
import {
  BATTLE_MAX_LEAD_MS,
  scheduleBeats,
  ScheduledBeat,
  useBattleTimeline,
} from "./battleTimeline";

const beats = (...durations: number[]) => durations.map((duration, i) => ({ duration, id: i }));

describe("scheduleBeats", () => {
  it("lays beats out back-to-back (each starts when the previous ends)", () => {
    const r = scheduleBeats(beats(500, 400, 300), { maxLeadMs: 5000 });
    expect(r.scheduled.map((s) => s.delay)).toEqual([0, 500, 900]);
    expect(r.dropped).toBe(0);
    expect(r.endMs).toBe(1200);
  });

  it("honours startMs as the first beat's entrance", () => {
    const r = scheduleBeats(beats(300, 300), { startMs: 200, maxLeadMs: 5000 });
    expect(r.scheduled.map((s) => s.delay)).toEqual([200, 500]);
    expect(r.endMs).toBe(800);
  });

  it("returns nothing for an empty batch (empty events → no beats)", () => {
    const r = scheduleBeats([], { maxLeadMs: 5000 });
    expect(r.scheduled).toEqual([]);
    expect(r.dropped).toBe(0);
    expect(r.endMs).toBe(0);
  });

  it("drops the tail once the entrance lead passes the cap", () => {
    // Four 800ms beats enter at 0, 800, 1600, 2400. With a 2000ms cap the fourth
    // (2400 > 2000) is dropped; the third (1600) still fits.
    const r = scheduleBeats(beats(800, 800, 800, 800), { maxLeadMs: 2000 });
    expect(r.scheduled.map((s) => s.delay)).toEqual([0, 800, 1600]);
    expect(r.dropped).toBe(1);
  });

  it("keeps the whole battle run within the exported cap for a realistic combat", () => {
    // Three modifier chips at 700ms each: last enters at 1400 ≤ 2500.
    const r = scheduleBeats(beats(700, 700, 700), { maxLeadMs: BATTLE_MAX_LEAD_MS });
    expect(r.dropped).toBe(0);
    expect(r.scheduled[r.scheduled.length - 1].delay).toBeLessThanOrEqual(BATTLE_MAX_LEAD_MS);
  });
});

describe("useBattleTimeline", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const scheduleOf = (...delays: number[]): ScheduledBeat<{ id: number }>[] =>
    delays.map((delay, id) => ({ item: { id }, delay }));

  it("fires each scheduled beat at its delay, in order", () => {
    const { result } = renderHook(() => useBattleTimeline());
    const fired: number[] = [];
    act(() => result.current.run(scheduleOf(0, 300, 600), (i) => fired.push(i.id)));

    act(() => jest.advanceTimersByTime(0));
    expect(fired).toEqual([0]);
    act(() => jest.advanceTimersByTime(300));
    expect(fired).toEqual([0, 1]);
    act(() => jest.advanceTimersByTime(300));
    expect(fired).toEqual([0, 1, 2]);
  });

  it("cancel() clears pending beats (a new combat wipes the old sequence)", () => {
    const { result } = renderHook(() => useBattleTimeline());
    const fired: number[] = [];
    act(() => result.current.run(scheduleOf(0, 300, 600), (i) => fired.push(i.id)));
    act(() => jest.advanceTimersByTime(0)); // beat 0 fires immediately
    act(() => result.current.cancel());
    act(() => jest.advanceTimersByTime(1000));
    expect(fired).toEqual([0]); // beats 1 & 2 never fire
  });

  it("clears every timer on unmount (no orphaned beats)", () => {
    const { result, unmount } = renderHook(() => useBattleTimeline());
    const fired: number[] = [];
    act(() => result.current.run(scheduleOf(100, 200), (i) => fired.push(i.id)));
    unmount();
    act(() => jest.advanceTimersByTime(1000));
    expect(fired).toEqual([]);
  });
});
