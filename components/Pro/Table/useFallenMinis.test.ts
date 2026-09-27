import { act, renderHook } from "@testing-library/react";
import type { FighterId, ViewFighter } from "@/lib/pro/protocol";
import type { Mini3d } from "@/lib/pro/minis3d/manifest";
import { TOPPLE_MS } from "@/lib/pro/minis3d/pose";
import type { TableStrike } from "./tableMiniCues";
import { FALL_GRACE_MS, FALL_TAIL_MS, toppleFor, useFallenMinis, type StandingMini } from "./useFallenMinis";

const mini = { id: "kt@30k", url: "/kt.glb", baseDiameter: 1 } as Mini3d;
const fighter = (over: Partial<ViewFighter> = {}): ViewFighter =>
  ({
    id: "p2/hero",
    owner: "p2",
    kind: "HERO",
    name: "King Taranis",
    space: "s2",
    tailSpace: null,
    hp: 3,
    maxHp: 14,
    reach: "MELEE",
    size: "NORMAL",
    defeated: false,
    ...over,
  }) as ViewFighter;
const strike: TableStrike = {
  key: "strike:a->b",
  attacker: "p1/hero",
  target: "p2/hero",
  variant: "win",
  damage: 3,
  lungeDelayMs: 850,
  lungeMs: 680,
  contactMs: 1149,
  reactMs: 680,
};

type Props = { fighters: ViewFighter[]; strike: TableStrike | null; reducedMotion: boolean };
const standingOf = (fs: ViewFighter[]) =>
  new Map<FighterId, StandingMini>(
    fs.filter((f) => f.space && !f.defeated).map((f) => [f.id, { fighter: f as StandingMini["fighter"], mini }])
  );

const standingUp = [fighter()];
// The defeating batch: the fighter is defeated and off the board.
const knockedOut = [fighter({ defeated: true, space: null, hp: 0 })];

const setup = (initial: Partial<Props> = {}) =>
  renderHook(
    (p: Props) =>
      useFallenMinis({
        fighters: p.fighters,
        standing: standingOf(p.fighters),
        attack: { attacker: "p1/hero", target: "p2/hero" },
        strike: p.strike,
        reducedMotion: p.reducedMotion,
      }),
    { initialProps: { fighters: standingUp, strike: null, reducedMotion: false, ...initial } }
  );

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test("a standing mini has no ghost; a defeated one gets exactly one, facing its attacker", () => {
  const h = setup();
  expect(h.result.current).toEqual([]);
  act(() => h.rerender({ fighters: knockedOut, strike: null, reducedMotion: false }));
  expect(h.result.current).toHaveLength(1);
  expect(h.result.current[0]).toMatchObject({ foe: "p1/hero", now: false });
  expect(h.result.current[0].fighter.space).toBe("s2");
  // Later batches with the fighter still defeated add no second ghost.
  act(() => h.rerender({ fighters: [...knockedOut], strike: null, reducedMotion: false }));
  expect(h.result.current).toHaveLength(1);
});

test("with no strike it stands through the grace, then falls at once and is removed after the topple", () => {
  const h = setup();
  act(() => h.rerender({ fighters: knockedOut, strike: null, reducedMotion: false }));
  expect(toppleFor(h.result.current[0], null)).toBeNull();
  act(() => jest.advanceTimersByTime(FALL_GRACE_MS));
  expect(toppleFor(h.result.current[0], null)).toEqual({ key: h.result.current[0].key, delayMs: 0 });
  act(() => jest.advanceTimersByTime(TOPPLE_MS + FALL_TAIL_MS - 1));
  expect(h.result.current).toHaveLength(1);
  act(() => jest.advanceTimersByTime(1));
  expect(h.result.current).toEqual([]);
  expect(jest.getTimerCount()).toBe(0);
});

test("a strike arriving after the defeat makes it fall at the contact, and it stays for contact + topple", () => {
  const h = setup();
  act(() => h.rerender({ fighters: knockedOut, strike: null, reducedMotion: false }));
  act(() => h.rerender({ fighters: knockedOut, strike, reducedMotion: false }));
  const ghost = h.result.current[0];
  expect(toppleFor(ghost, strike)).toEqual({ key: ghost.key, delayMs: strike.contactMs });
  // Someone else's strike does not topple it.
  expect(toppleFor(ghost, { ...strike, target: "p2/sk" })).toBeNull();
  act(() => jest.advanceTimersByTime(FALL_GRACE_MS + strike.contactMs + TOPPLE_MS + FALL_TAIL_MS - 1));
  expect(h.result.current).toHaveLength(1);
  act(() => jest.advanceTimersByTime(1));
  expect(h.result.current).toEqual([]);
});

test("no ghost at all under reduced motion", () => {
  const h = setup({ reducedMotion: true });
  act(() => h.rerender({ fighters: knockedOut, strike: null, reducedMotion: true }));
  expect(h.result.current).toEqual([]);
  expect(jest.getTimerCount()).toBe(0);
});

test("reduced motion turning on mid-topple unmounts the ghost and its timers", () => {
  const h = setup();
  act(() => h.rerender({ fighters: knockedOut, strike: null, reducedMotion: false }));
  expect(h.result.current).toHaveLength(1);
  act(() => h.rerender({ fighters: knockedOut, strike: null, reducedMotion: true }));
  expect(h.result.current).toEqual([]);
  expect(jest.getTimerCount()).toBe(0);
  // ...and it does not come back when reduced motion turns off again.
  act(() => h.rerender({ fighters: knockedOut, strike: null, reducedMotion: false }));
  expect(h.result.current).toEqual([]);
});

test("unmount clears the pending timers", () => {
  const h = setup();
  act(() => h.rerender({ fighters: knockedOut, strike: null, reducedMotion: false }));
  expect(jest.getTimerCount()).toBeGreaterThan(0);
  h.unmount();
  expect(jest.getTimerCount()).toBe(0);
});
