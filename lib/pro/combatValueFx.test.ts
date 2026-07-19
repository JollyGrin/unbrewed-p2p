import { act, renderHook } from "@testing-library/react";
import { deriveValueBeats, useCombatValueFx, CHIP_DURATION_MS } from "./combatValueFx";
import { CardMeta, GameEvent, PlayerView, ViewCombat, ViewCombatCard } from "./protocol";

const card = (instance: string, over: Partial<ViewCombatCard> = {}): ViewCombatCard => ({
  instance,
  role: "ATTACK",
  boosts: [],
  effectiveValue: 3,
  ...over,
});

const combat = (over: Partial<ViewCombat>): ViewCombat => ({
  attackerPlayer: "p1",
  defenderPlayer: "p2",
  attacker: "p1/hero",
  target: "p2/hero",
  stage: "DURING",
  attackerCard: card("king-kong/clobber#1", { effectiveValue: 4 }),
  defenderCard: card("baba-yaga/dodge#1", { role: "DEFENSE", effectiveValue: 2 }),
  additionalDefenseCard: null,
  outcome: null,
  attackDamageDealt: null,
  ...over,
});

const catalog: Record<string, CardMeta> = {
  "king-kong/clobber": { title: "Clobber", type: "attack", value: 2, boost: 1 },
  "king-kong/leap": { title: "Leap", type: "scheme", value: null, boost: 2 },
  "baba-yaga/dodge": { title: "Dodge", type: "defense", value: 3, boost: 2 },
};

const view = (over: Partial<PlayerView>): PlayerView => ({
  you: "p1",
  phase: "PLAY",
  turnNumber: 1,
  activePlayer: "p1",
  actionsRemaining: 2,
  turnPhase: "ACTION_SELECT",
  maneuver: null,
  map: { schemaVersion: "1", id: "m", meta: { title: "m", minPlayers: 2, maxPlayers: 2, specialRules: false }, zones: [], spaces: [] },
  catalog,
  fighters: [],
  tokens: [],
  self: { id: "p1", heroId: "king-kong", hand: [], deckCount: 10, discard: [], committedCard: null, counters: {}, flags: {}, wonCombatThisTurn: false, lostCombatThisTurn: false, firstAttackThisTurn: false, playedACardThisTurn: false, tookDamageThisTurn: false },
  opponent: { id: "p2", heroId: "baba-yaga", handCount: 5, deckCount: 10, discard: [], hasCommitted: false, counters: {}, flags: {}, wonCombatThisTurn: false, lostCombatThisTurn: false, firstAttackThisTurn: false, playedACardThisTurn: false, tookDamageThisTurn: false },
  players: [],
  combat: null,
  prompt: null,
  winner: null,
  ...over,
});

describe("deriveValueBeats", () => {
  it("emits nothing on the first snapshot (join is not a play)", () => {
    const beats = deriveValueBeats(null, view({ combat: combat({}) }), [], catalog);
    expect(beats).toEqual({ ATTACK: null, DEFENSE: null });
  });

  it("emits nothing for an empty event batch (reconnect → no ghost chips)", () => {
    const prev = view({ combat: combat({}) });
    const next = view({ combat: combat({ stage: "DAMAGE" }) });
    expect(deriveValueBeats(prev, next, [], catalog)).toEqual({ ATTACK: null, DEFENSE: null });
  });

  it("derives one effect chip and ticks the pill from old to new effective", () => {
    const prev = view({ combat: combat({}) });
    const next = view({ combat: combat({ attackerCard: card("king-kong/clobber#1", { effectiveValue: 3 }) }) });
    const events: GameEvent[] = [{ type: "VALUE_MODIFIED", role: "ATTACK", delta: -1, newEffective: 3 }];
    const beats = deriveValueBeats(prev, next, events, catalog);
    expect(beats.ATTACK).toEqual({
      chips: [
        {
          role: "ATTACK",
          delta: -1,
          label: "−1 effect",
          source: null,
          toValue: 3,
          duration: CHIP_DURATION_MS,
        },
      ],
      startValue: 4, // final 3 − delta(−1) = 4
      finalValue: 3,
    });
    expect(beats.DEFENSE).toBeNull();
  });

  it("pairs a boost with its value change into ONE chip (no doubled tick)", () => {
    const prev = view({ combat: combat({}) });
    const next = view({ combat: combat({ attackerCard: card("king-kong/clobber#1", { effectiveValue: 6 }) }) });
    const events: GameEvent[] = [
      { type: "CARD_BOOSTED", role: "ATTACK", card: "king-kong/leap#2", blind: false },
      { type: "VALUE_MODIFIED", role: "ATTACK", delta: 2, newEffective: 6 },
    ];
    const beats = deriveValueBeats(prev, next, events, catalog);
    expect(beats.ATTACK?.chips).toHaveLength(1);
    expect(beats.ATTACK?.chips[0]).toMatchObject({ delta: 2, label: "+2 boost", source: "king-kong/leap#2", toValue: 6 });
    expect(beats.ATTACK?.startValue).toBe(4);
  });

  it("sequences multiple modifiers, forward-simulating the pill each step", () => {
    const prev = view({ combat: combat({}) });
    const next = view({ combat: combat({ defenderCard: card("baba-yaga/dodge#1", { role: "DEFENSE", effectiveValue: 5 }) }) });
    const events: GameEvent[] = [
      { type: "VALUE_MODIFIED", role: "DEFENSE", delta: 2, newEffective: 4 },
      { type: "VALUE_MODIFIED", role: "DEFENSE", delta: 1, newEffective: 5 },
    ];
    const beats = deriveValueBeats(prev, next, events, catalog);
    expect(beats.DEFENSE?.startValue).toBe(2); // 5 − (2+1)
    expect(beats.DEFENSE?.chips.map((c) => c.toValue)).toEqual([4, 5]);
  });

  it("a standalone non-blind boost still ticks by its catalog boost value", () => {
    const prev = view({ combat: combat({}) });
    const next = view({ combat: combat({ attackerCard: card("king-kong/clobber#1", { effectiveValue: 6 }) }) });
    const events: GameEvent[] = [{ type: "CARD_BOOSTED", role: "ATTACK", card: "king-kong/leap#2", blind: false }];
    const beats = deriveValueBeats(prev, next, events, catalog);
    expect(beats.ATTACK?.chips[0]).toMatchObject({ delta: 2, label: "+2 boost", toValue: 6 });
    expect(beats.ATTACK?.startValue).toBe(4);
  });

  it("a blind boost is a decorative delta-0 chip (value hidden)", () => {
    const prev = view({ combat: combat({}) });
    const next = view({ combat: combat({ attackerCard: card("king-kong/clobber#1", { effectiveValue: 4 }) }) });
    const events: GameEvent[] = [{ type: "CARD_BOOSTED", role: "ATTACK", card: "king-kong/leap#2", blind: true }];
    const beats = deriveValueBeats(prev, next, events, catalog);
    expect(beats.ATTACK?.chips[0]).toMatchObject({ delta: 0, label: "boost" });
    expect(beats.ATTACK?.startValue).toBe(4);
    expect(beats.ATTACK?.finalValue).toBe(4);
  });

  it("reads the final value from prev.combat when the combat ends in the same batch", () => {
    // next.combat is already null (resolved+ended) — the effective value survives on prev.
    const prev = view({ combat: combat({ attackerCard: card("king-kong/clobber#1", { effectiveValue: 5 }) }) });
    const next = view({ combat: null });
    const events: GameEvent[] = [
      { type: "VALUE_MODIFIED", role: "ATTACK", delta: 2, newEffective: 5 },
      { type: "COMBAT_RESOLVED", outcome: "ATTACKER_WON" },
      { type: "COMBAT_ENDED" },
    ];
    const beats = deriveValueBeats(prev, next, events, catalog);
    expect(beats.ATTACK?.finalValue).toBe(5);
    expect(beats.ATTACK?.startValue).toBe(3);
  });
});

describe("useCombatValueFx", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const snap = (v: PlayerView, events: GameEvent[] = []) => ({ view: v, events });

  it("starts the pill low, then ticks it up to the final value as the chip lands", () => {
    const first = snap(view({ combat: combat({}) }));
    const { result, rerender } = renderHook((p: { s: ReturnType<typeof snap> }) => useCombatValueFx(p.s), {
      initialProps: { s: first },
    });
    expect(result.current.ATTACK.displayValue).toBeNull();

    const next = view({ combat: combat({ attackerCard: card("king-kong/clobber#1", { effectiveValue: 6 }) }) });
    const events: GameEvent[] = [{ type: "VALUE_MODIFIED", role: "ATTACK", delta: 3, newEffective: 6 }];
    act(() => rerender({ s: snap(next, events) }));
    // Pill snaps to the pre-modifier value immediately.
    expect(result.current.ATTACK.displayValue).toBe(3);

    // The chip appears at its scheduled entrance, then the pill counts up 3→6.
    act(() => jest.advanceTimersByTime(0));
    expect(result.current.ATTACK.chips).toHaveLength(1);
    act(() => jest.advanceTimersByTime(500));
    expect(result.current.ATTACK.displayValue).toBe(6);
  });

  it("cancels an in-flight run when a new combat's beats arrive", () => {
    const first = snap(view({ combat: combat({}) }));
    const { result, rerender } = renderHook((p: { s: ReturnType<typeof snap> }) => useCombatValueFx(p.s), {
      initialProps: { s: first },
    });
    const evA: GameEvent[] = [
      { type: "VALUE_MODIFIED", role: "ATTACK", delta: 1, newEffective: 5 },
      { type: "VALUE_MODIFIED", role: "ATTACK", delta: 1, newEffective: 6 },
    ];
    act(() => rerender({ s: snap(view({ combat: combat({ attackerCard: card("king-kong/clobber#1", { effectiveValue: 6 }) }) }), evA) }));
    act(() => jest.advanceTimersByTime(CHIP_DURATION_MS / 2));

    // A fresh combat arrives — its beats supersede; only the new chip should show.
    const evB: GameEvent[] = [{ type: "VALUE_MODIFIED", role: "ATTACK", delta: 2, newEffective: 7 }];
    act(() => rerender({ s: snap(view({ combat: combat({ attackerCard: card("king-kong/uppercut#9", { effectiveValue: 7 }) }) }), evB) }));
    expect(result.current.ATTACK.displayValue).toBe(5); // 7 − 2, the new start
    act(() => jest.advanceTimersByTime(0));
    expect(result.current.ATTACK.chips).toHaveLength(1);
  });
});
