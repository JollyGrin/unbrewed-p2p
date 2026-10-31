import { act, renderHook } from "@testing-library/react";
import { useBreakoutMoment } from "./useBreakoutMoment";
import type { GameEvent, PlayerView } from "./protocol";

const overflow: GameEvent = { type: "THREAT_OVERFLOW", overflows: 1, objective: null };
const opened: GameEvent = { type: "SPACE_OPENED", space: "s3" };
const spawn: GameEvent = { type: "ENEMY_SPAWNED", fighter: "e1", enemyId: "raptor", card: "raptor-1" };

const view = (display: Record<string, unknown> | null = null): PlayerView =>
  ({
    winner: null,
    map: {
      spaces: [{ id: "s3", startsBlocked: true }, { id: "s4", startsBlocked: true }],
      scenario: { groups: [{ id: "pens", spaces: ["s3", "s4"], kind: "CONTAINS", order: [2, 5] }] },
    },
    blockedSpaces: ["s4"],
    tokens: [],
    fighters: [{ id: "e1", name: "Raptor", hp: 5, maxHp: 5, size: "NORMAL", enemy: { role: "MINION", move: 4 } }],
    scenario: { threat: { position: 0, level: 0, overflows: 1, positions: [] }, objectives: [], ...(display ? { display } : {}) },
  }) as unknown as PlayerView;

describe("useBreakoutMoment (moved out of LiveGame, #1303)", () => {
  it("the first view witnessed nothing; a later batch with the chain is a moment", () => {
    const { result, rerender } = renderHook(({ v, e }) => useBreakoutMoment(v, e), {
      initialProps: { v: view(), e: [overflow, opened, spawn] as GameEvent[] },
    });
    expect(result.current.moment).toBeNull();
    rerender({ v: view(), e: [overflow, opened, spawn] });
    expect(result.current.moment?.enemy?.name).toBe("Raptor");
    act(() => result.current.dismiss());
    expect(result.current.moment).toBeNull();
  });

  it("an enemy-less breakout is filled by the later ENEMY_SPAWNED batch", () => {
    const { result, rerender } = renderHook(({ v, e }) => useBreakoutMoment(v, e), {
      initialProps: { v: view(), e: [] as GameEvent[] },
    });
    rerender({ v: view(), e: [overflow, opened] });
    expect(result.current.moment?.enemy).toBeNull();
    rerender({ v: view(), e: [spawn] });
    expect(result.current.moment?.enemy?.name).toBe("Raptor");
  });

  // #1494: a tied nearest enclosure (or Isla Nublar once Indominus is gone) parks the overflow on a
  // team CHOOSE_SPACE prompt; the open + release arrive in the batch that answers it.
  it("an overflow batch with no SPACE_OPENED waits for the batch that opens the picked enclosure", () => {
    const { result, rerender } = renderHook(({ v, e }) => useBreakoutMoment(v, e), {
      initialProps: { v: view(), e: [] as GameEvent[] },
    });
    rerender({ v: view(), e: [overflow] });
    expect(result.current.moment).toBeNull();
    rerender({ v: view(), e: [opened, spawn] });
    expect(result.current.moment?.objectNumber).toBe(2);
    expect(result.current.moment?.enemy?.name).toBe("Raptor");
    act(() => result.current.dismiss());
    rerender({ v: view(), e: [opened] });
    expect(result.current.moment).toBeNull();
  });

  it("a split game-losing overflow still hands off to the end screen", () => {
    const { result, rerender } = renderHook(({ v, e }) => useBreakoutMoment(v, e), {
      initialProps: { v: view({ lossLimit: 1 }), e: [] as GameEvent[] },
    });
    rerender({ v: view({ lossLimit: 1 }), e: [overflow] });
    rerender({ v: view({ lossLimit: 1 }), e: [opened, spawn] });
    expect(result.current.moment).toBeNull();
  });

  it("an overflow on the first view (join / reload) is not held over", () => {
    const { result, rerender } = renderHook(({ v, e }) => useBreakoutMoment(v, e), {
      initialProps: { v: view(), e: [overflow] as GameEvent[] },
    });
    rerender({ v: view(), e: [opened, spawn] });
    expect(result.current.moment).toBeNull();
  });
});
