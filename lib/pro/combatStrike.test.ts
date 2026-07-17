import { act, renderHook } from "@testing-library/react";
import {
  captureLingeringCombat,
  comparePulseFor,
  diffCombatStrike,
  LINGER_TTL_MS,
  STRIKE_TTL_MS,
  useCombatStrike,
} from "./combatStrike";
import { GameEvent, PlayerView, ViewCombat, ViewCombatCard } from "./protocol";

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
  stage: "DAMAGE",
  attackerCard: card("king-kong/clobber#1"),
  defenderCard: card("baba-yaga/dodge#1", { role: "DEFENSE" }),
  outcome: null,
  attackDamageDealt: null,
  ...over,
});

const view = (over: Partial<PlayerView>): PlayerView => ({
  you: "p1",
  phase: "PLAY",
  turnNumber: 1,
  activePlayer: "p1",
  actionsRemaining: 2,
  turnPhase: "ACTION_SELECT",
  maneuver: null,
  map: { schemaVersion: "1", id: "m", meta: { title: "m", minPlayers: 2, maxPlayers: 2, specialRules: false }, zones: [], spaces: [] },
  catalog: {},
  fighters: [],
  tokens: [],
  self: { id: "p1", heroId: "king-kong", hand: [], deckCount: 10, discard: [], committedCard: null, counters: {}, flags: {}, wonCombatThisTurn: false },
  opponent: { id: "p2", heroId: "baba-yaga", handCount: 5, deckCount: 10, discard: [], hasCommitted: false, counters: {}, flags: {}, wonCombatThisTurn: false },
  players: [
    { id: "p1", heroId: "fixture-p1", you: true, hand: [], handCount: 0, deckCount: 10, discard: [], committedCard: null, hasCommitted: false, counters: {}, flags: {}, wonCombatThisTurn: false },
    { id: "p2", heroId: "fixture-p2", you: false, handCount: 5, deckCount: 10, discard: [], hasCommitted: false, counters: {}, flags: {}, wonCombatThisTurn: false },
  ],
  combat: null,
  prompt: null,
  winner: null,
  ...over,
});

/** A combat that resolves + ends in one batch: view.combat is already null next. */
const resolvedEnded = (outcome: "ATTACKER_WON" | "DEFENDER_WON", damage: number): GameEvent[] => {
  const evs: GameEvent[] = [
    { type: "CARDS_REVEALED", attackerCard: "king-kong/clobber#1", defenderCard: "baba-yaga/dodge#1" },
  ];
  if (damage > 0) evs.push({ type: "COMBAT_DAMAGE", amount: damage });
  evs.push({ type: "COMBAT_RESOLVED", outcome });
  evs.push({ type: "COMBAT_ENDED" });
  return evs;
};

describe("diffCombatStrike", () => {
  it("emits nothing on the first snapshot (join/reconnect is not a play)", () => {
    expect(diffCombatStrike(null, view({ combat: combat({}) }), [])).toBeNull();
  });

  it("emits nothing on a mid-combat reconnect (empty events, no outcome change)", () => {
    const prev = view({ combat: combat({ stage: "DURING" }) });
    const next = view({ combat: combat({ stage: "DURING" }) });
    expect(diffCombatStrike(prev, next, [])).toBeNull();
  });

  it("emits nothing on a pure reveal (no resolve yet)", () => {
    const prev = view({ combat: combat({ stage: "COMMIT_DEFENSE", attackerCard: null, defenderCard: null }) });
    const next = view({ combat: combat({ stage: "IMMEDIATELY" }) });
    const events: GameEvent[] = [
      { type: "CARDS_REVEALED", attackerCard: "king-kong/clobber#1", defenderCard: "baba-yaga/dodge#1" },
    ];
    expect(diffCombatStrike(prev, next, events)).toBeNull();
  });

  it("emits a WIN strike when the attacker deals damage (combat ends in the batch)", () => {
    const prev = view({ combat: combat({ stage: "DAMAGE" }) });
    const next = view({ combat: null });
    const s = diffCombatStrike(prev, next, resolvedEnded("ATTACKER_WON", 4));
    expect(s).toEqual({
      key: "strike:king-kong/clobber#1->baba-yaga/dodge#1",
      variant: "win",
      damage: 4,
      outcome: "ATTACKER_WON",
    });
  });

  it("emits a BLOCKED strike when the defender wins with no damage", () => {
    const prev = view({ combat: combat({ stage: "DAMAGE" }) });
    const next = view({ combat: null });
    const s = diffCombatStrike(prev, next, resolvedEnded("DEFENDER_WON", 0));
    expect(s?.variant).toBe("blocked");
    expect(s?.damage).toBe(0);
    expect(s?.outcome).toBe("DEFENDER_WON");
  });

  it("emits a TIE strike when it resolves with no damage but not a defender win", () => {
    const prev = view({ combat: combat({ stage: "DAMAGE" }) });
    const next = view({ combat: null });
    const s = diffCombatStrike(prev, next, resolvedEnded("ATTACKER_WON", 0));
    expect(s?.variant).toBe("tie");
    expect(s?.damage).toBe(0);
  });

  it("resolves via the view outcome transition when no resolve event rides along", () => {
    const prev = view({ combat: combat({ stage: "DAMAGE", outcome: "UNKNOWN" }) });
    const next = view({ combat: combat({ stage: "AFTER", outcome: "ATTACKER_WON", attackDamageDealt: 2 }) });
    const s = diffCombatStrike(prev, next, []);
    expect(s?.variant).toBe("win");
    expect(s?.damage).toBe(2);
  });

  it("suppresses the strike when an EFFECT_CANCELED ends the combat (The Snuff)", () => {
    const prev = view({ combat: combat({ stage: "DAMAGE" }) });
    const next = view({ combat: null });
    const events: GameEvent[] = [
      ...resolvedEnded("ATTACKER_WON", 2),
      { type: "EFFECT_CANCELED", role: "DEFENSE", scope: "TEXT" },
    ];
    expect(diffCombatStrike(prev, next, events)).toBeNull();
  });

  it("still strikes when a during-combat cancel does NOT end the combat", () => {
    const prev = view({ combat: combat({ stage: "DURING" }) });
    const next = view({ combat: combat({ stage: "DAMAGE", outcome: "ATTACKER_WON", attackDamageDealt: 3 }) });
    const events: GameEvent[] = [
      { type: "EFFECT_CANCELED", role: "ATTACK", scope: "TEXT" },
      { type: "COMBAT_DAMAGE", amount: 3 },
      { type: "COMBAT_RESOLVED", outcome: "ATTACKER_WON" },
    ];
    const s = diffCombatStrike(prev, next, events);
    expect(s?.variant).toBe("win");
    expect(s?.damage).toBe(3);
  });

  it("keys stably per combat (so the hook emits each combat once)", () => {
    const prev = view({ combat: combat({ stage: "DAMAGE" }) });
    const next = view({ combat: null });
    const a = diffCombatStrike(prev, next, resolvedEnded("ATTACKER_WON", 1));
    const b = diffCombatStrike(prev, next, resolvedEnded("ATTACKER_WON", 1));
    expect(a?.key).toBe(b?.key);
  });

  it("gives a different key to a different combat (fresh card instances)", () => {
    const prev = view({ combat: combat({ stage: "DAMAGE" }) });
    const next = view({ combat: null });
    const first = diffCombatStrike(prev, next, resolvedEnded("ATTACKER_WON", 1));
    const events2: GameEvent[] = [
      { type: "CARDS_REVEALED", attackerCard: "king-kong/clobber#2", defenderCard: "baba-yaga/dodge#2" },
      { type: "COMBAT_DAMAGE", amount: 1 },
      { type: "COMBAT_RESOLVED", outcome: "ATTACKER_WON" },
      { type: "COMBAT_ENDED" },
    ];
    const second = diffCombatStrike(prev, next, events2);
    expect(first?.key).not.toBe(second?.key);
  });
});

describe("comparePulseFor", () => {
  it("glows the attacker gold and dims the defender on a win", () => {
    expect(comparePulseFor("win", "ATTACK")).toBe("gold");
    expect(comparePulseFor("win", "DEFENSE")).toBe("dim");
  });

  it("glows the defender gold and dims the attacker on a block", () => {
    expect(comparePulseFor("blocked", "DEFENSE")).toBe("gold");
    expect(comparePulseFor("blocked", "ATTACK")).toBe("dim");
  });

  it("flashes BOTH values neutrally on a tie (0-damage draw still reads)", () => {
    expect(comparePulseFor("tie", "ATTACK")).toBe("neutral");
    expect(comparePulseFor("tie", "DEFENSE")).toBe("neutral");
  });

  it("returns null when there is no strike (nothing to compare yet)", () => {
    expect(comparePulseFor(undefined, "ATTACK")).toBeNull();
  });
});

describe("captureLingeringCombat", () => {
  it("freezes the last live combat with the resolved outcome/damage stamped on", () => {
    const prev = view({ combat: combat({ stage: "DAMAGE" }) });
    const frozen = captureLingeringCombat(prev, {
      key: "k",
      variant: "win",
      damage: 5,
      outcome: "ATTACKER_WON",
    });
    expect(frozen?.stage).toBe("CLEANUP");
    expect(frozen?.outcome).toBe("ATTACKER_WON");
    expect(frozen?.attackDamageDealt).toBe(5);
    expect(frozen?.attackerCard?.instance).toBe("king-kong/clobber#1");
  });

  it("returns null when there is no live combat to freeze", () => {
    const prev = view({ combat: null });
    expect(
      captureLingeringCombat(prev, { key: "k", variant: "tie", damage: 0, outcome: null })
    ).toBeNull();
  });
});

describe("useCombatStrike", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const snap = (v: PlayerView, events: GameEvent[] = []) => ({ view: v, events });

  it("emits a strike once per combat and does not re-fire the same combat", () => {
    const { result, rerender } = renderHook((props: { s: ReturnType<typeof snap> }) => useCombatStrike(props.s), {
      initialProps: { s: snap(view({ combat: combat({ stage: "DURING" }) })) },
    });
    // First snapshot is a state dump — no strike.
    expect(result.current.strike).toBeNull();

    // The resolving+ending batch fires the strike.
    act(() => rerender({ s: snap(view({ combat: null }), resolvedEnded("ATTACKER_WON", 3)) }));
    expect(result.current.strike?.variant).toBe("win");

    // After the strike TTL it clears...
    act(() => jest.advanceTimersByTime(STRIKE_TTL_MS + 20));
    expect(result.current.strike).toBeNull();

    // ...and the SAME combat redelivered (idempotent resend) does not re-fire.
    act(() => rerender({ s: snap(view({ combat: null }), resolvedEnded("ATTACKER_WON", 3)) }));
    expect(result.current.strike).toBeNull();
  });

  it("lingers the resolved combat, then a NEW live combat cancels the linger", () => {
    const { result, rerender } = renderHook((props: { s: ReturnType<typeof snap> }) => useCombatStrike(props.s), {
      initialProps: { s: snap(view({ combat: combat({ stage: "DURING" }) })) },
    });

    // Combat resolves + ends in one batch → panel should linger.
    act(() => rerender({ s: snap(view({ combat: null }), resolvedEnded("ATTACKER_WON", 2)) }));
    expect(result.current.lingeringCombat).not.toBeNull();
    expect(result.current.lingeringCombat?.attackDamageDealt).toBe(2);

    // A brand-new live combat arrives before the linger TTL → cancels it immediately.
    const fresh = combat({ stage: "COMMIT_DEFENSE", attackerCard: card("king-kong/uppercut#7"), defenderCard: null });
    act(() => rerender({ s: snap(view({ combat: fresh })) }));
    expect(result.current.lingeringCombat).toBeNull();
  });

  it("clears the linger on its own after the TTL when nothing follows", () => {
    const { result, rerender } = renderHook((props: { s: ReturnType<typeof snap> }) => useCombatStrike(props.s), {
      initialProps: { s: snap(view({ combat: combat({ stage: "DURING" }) })) },
    });
    act(() => rerender({ s: snap(view({ combat: null }), resolvedEnded("DEFENDER_WON", 0)) }));
    expect(result.current.lingeringCombat).not.toBeNull();
    act(() => jest.advanceTimersByTime(LINGER_TTL_MS + 20));
    expect(result.current.lingeringCombat).toBeNull();
  });
});
