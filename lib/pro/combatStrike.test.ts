import { act, renderHook } from "@testing-library/react";
import {
  captureLingeringCombat,
  combatHasRevealed,
  comparePulseFor,
  diffCombatStrike,
  LINGER_HOLD_MS,
  LINGER_TTL_MS,
  panelCombatFor,
  STRIKE_TTL_MS,
  useCombatStrike,
} from "./combatStrike";
import { ARC_FLIGHT_MS, ARC_LAUNCH_MS, DAMAGE_BEAT_MS, SETTLE_DWELL_MS } from "./combatTiming";
import { CombatOutcome, GameEvent, PlayerView, ViewCombat, ViewCombatCard } from "./protocol";

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
  additionalDefenseCard: null,
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
  self: { id: "p1", heroId: "king-kong", hand: [], deckCount: 10, discard: [], committedCard: null, counters: {}, flags: {}, wonCombatThisTurn: false, lostCombatThisTurn: false, firstAttackThisTurn: false, playedACardThisTurn: false, tookDamageThisTurn: false },
  opponent: { id: "p2", heroId: "baba-yaga", handCount: 5, deckCount: 10, discard: [], hasCommitted: false, counters: {}, flags: {}, wonCombatThisTurn: false, lostCombatThisTurn: false, firstAttackThisTurn: false, playedACardThisTurn: false, tookDamageThisTurn: false },
  players: [
    { id: "p1", heroId: "fixture-p1", you: true, hand: [], handCount: 0, deckCount: 10, discard: [], committedCard: null, hasCommitted: false, counters: {}, flags: {}, wonCombatThisTurn: false, lostCombatThisTurn: false, firstAttackThisTurn: false, playedACardThisTurn: false, tookDamageThisTurn: false },
    { id: "p2", heroId: "fixture-p2", you: false, handCount: 5, deckCount: 10, discard: [], hasCommitted: false, counters: {}, flags: {}, wonCombatThisTurn: false, lostCombatThisTurn: false, firstAttackThisTurn: false, playedACardThisTurn: false, tookDamageThisTurn: false },
  ],
  combat: null,
  prompt: null,
  winner: null,
  ...over,
});

/** A combat that resolves + ends in one batch: view.combat is already null next. */
const resolvedEnded = (outcome: CombatOutcome, damage: number): GameEvent[] => {
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
      suppressStrike: false,
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

  // Issue #545 ↔ engine #303 "The Doppelgänger": the first deck that can emit
  // COMBAT_RESOLVED {outcome:'UNKNOWN'}. The neutral mutual-shove `tie`
  // choreography is right for it; a `blocked` shield-bounce (the defender-win
  // variant) would be a lie, and so would the attacker's gold `win`.
  it("emits a neutral TIE strike — never BLOCKED — on an UNKNOWN (no-winner) resolve", () => {
    const prev = view({ combat: combat({ stage: "DAMAGE" }) });
    const next = view({ combat: null });
    const s = diffCombatStrike(prev, next, resolvedEnded("UNKNOWN", 0));
    expect(s?.variant).toBe("tie");
    expect(s?.damage).toBe(0);
    expect(s?.outcome).toBe("UNKNOWN");
    // The value pulse must credit nobody: both sides flash neutrally.
    expect(comparePulseFor(s!.variant, "ATTACK")).toBe("neutral");
    expect(comparePulseFor(s!.variant, "DEFENSE")).toBe("neutral");
  });

  it("keeps a no-winner resolve neutral even if it somehow carried damage", () => {
    const prev = view({ combat: combat({ stage: "DAMAGE" }) });
    const next = view({ combat: null });
    const s = diffCombatStrike(prev, next, resolvedEnded("UNKNOWN", 2));
    expect(s?.variant).toBe("tie");
  });

  it("resolves an UNKNOWN via the view transition (null is the unresolved sentinel)", () => {
    // Pre-#545 this path excluded 'UNKNOWN' as if it meant "not yet resolved", so a
    // Doppelgänger stalemate arriving without a resolve event fired no strike at all.
    const prev = view({ combat: combat({ stage: "DAMAGE", outcome: null }) });
    const next = view({ combat: combat({ stage: "AFTER", outcome: "UNKNOWN", attackDamageDealt: 0 }) });
    const s = diffCombatStrike(prev, next, []);
    expect(s?.variant).toBe("tie");
    expect(s?.outcome).toBe("UNKNOWN");
  });

  it("resolves via the view outcome transition when no resolve event rides along", () => {
    const prev = view({ combat: combat({ stage: "DAMAGE", outcome: null }) });
    const next = view({ combat: combat({ stage: "AFTER", outcome: "ATTACKER_WON", attackDamageDealt: 2 }) });
    const s = diffCombatStrike(prev, next, []);
    expect(s?.variant).toBe("win");
    expect(s?.damage).toBe(2);
  });

  it("flags suppressStrike (but still returns the descriptor) when an EFFECT_CANCELED ends the combat (The Snuff)", () => {
    const prev = view({ combat: combat({ stage: "DAMAGE" }) });
    const next = view({ combat: null });
    const events: GameEvent[] = [
      ...resolvedEnded("ATTACKER_WON", 2),
      { type: "EFFECT_CANCELED", role: "DEFENSE", scope: "TEXT", card: null, voided: true, boostVoided: false },
    ];
    // The descriptor is returned so the panel can still LINGER (issue #147); only the
    // strike beat is suppressed so it doesn't double-animate against the Snuff callout.
    const s = diffCombatStrike(prev, next, events);
    expect(s?.suppressStrike).toBe(true);
    expect(s?.damage).toBe(2);
    expect(s?.outcome).toBe("ATTACKER_WON");
  });

  it("still strikes when a during-combat cancel does NOT end the combat", () => {
    const prev = view({ combat: combat({ stage: "DURING" }) });
    const next = view({ combat: combat({ stage: "DAMAGE", outcome: "ATTACKER_WON", attackDamageDealt: 3 }) });
    const events: GameEvent[] = [
      { type: "EFFECT_CANCELED", role: "ATTACK", scope: "TEXT", card: null, voided: true, boostVoided: false },
      { type: "COMBAT_DAMAGE", amount: 3 },
      { type: "COMBAT_RESOLVED", outcome: "ATTACKER_WON" },
    ];
    const s = diffCombatStrike(prev, next, events);
    expect(s?.variant).toBe("win");
    expect(s?.damage).toBe(3);
    expect(s?.suppressStrike).toBe(false);
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
      suppressStrike: false,
    });
    expect(frozen?.stage).toBe("CLEANUP");
    expect(frozen?.outcome).toBe("ATTACKER_WON");
    expect(frozen?.attackDamageDealt).toBe(5);
    expect(frozen?.attackerCard?.instance).toBe("king-kong/clobber#1");
  });

  it("returns null when there is no live combat to freeze", () => {
    const prev = view({ combat: null });
    expect(
      captureLingeringCombat(prev, { key: "k", variant: "tie", damage: 0, outcome: null, suppressStrike: false })
    ).toBeNull();
  });

  // Root cause A of #517: the whole combat arrives in one server drive, so the last
  // live combat is still PRE-reveal — freezing it verbatim froze the blank card.
  it("grafts the batch's revealed faces onto a PRE-reveal base (issue #517)", () => {
    const prev = view({
      combat: combat({ stage: "COMMIT_DEFENSE", attackerCard: null, defenderCard: null }),
      catalog: {
        "king-kong/clobber": { title: "Clobber", type: "attack", value: 4, boost: 2 },
        "baba-yaga/dodge": { title: "Dodge", type: "defense", value: 1, boost: 3 },
      },
    });
    const frozen = captureLingeringCombat(
      prev,
      { key: "k", variant: "win", damage: 3, outcome: "ATTACKER_WON", suppressStrike: false },
      resolvedEnded("ATTACKER_WON", 3)
    );
    expect(frozen?.attackerCard?.instance).toBe("king-kong/clobber#1");
    expect(frozen?.attackerCard?.role).toBe("ATTACK");
    expect(frozen?.defenderCard?.instance).toBe("baba-yaga/dodge#1");
    expect(frozen?.defenderCard?.role).toBe("DEFENSE");
    // No VALUE_* event rode along → the printed catalog values stand in.
    expect(frozen?.attackerCard?.effectiveValue).toBe(4);
    expect(frozen?.defenderCard?.effectiveValue).toBe(1);
  });

  it("uses the batch's announced effective values and boosts for a grafted face", () => {
    const prev = view({
      combat: combat({ stage: "COMMIT_DEFENSE", attackerCard: null, defenderCard: null }),
      catalog: { "king-kong/clobber": { title: "Clobber", type: "attack", value: 4, boost: 2 } },
    });
    const events: GameEvent[] = [
      ...resolvedEnded("ATTACKER_WON", 6),
      { type: "CARD_BOOSTED", role: "ATTACK", card: "king-kong/roar#3", blind: false },
      { type: "VALUE_MODIFIED", role: "ATTACK", delta: 2, newEffective: 6 },
    ];
    const frozen = captureLingeringCombat(
      prev,
      { key: "k", variant: "win", damage: 6, outcome: "ATTACKER_WON", suppressStrike: false },
      events
    );
    expect(frozen?.attackerCard?.effectiveValue).toBe(6);
    expect(frozen?.attackerCard?.boosts).toEqual(["king-kong/roar#3"]);
  });

  it("keeps the live faces when the view already carried them (server values win)", () => {
    const prev = view({ combat: combat({ stage: "DAMAGE" }) });
    const frozen = captureLingeringCombat(
      prev,
      { key: "k", variant: "win", damage: 1, outcome: "ATTACKER_WON", suppressStrike: false },
      // A stale/odd reveal in the same batch must not overwrite what the view published.
      [{ type: "CARDS_REVEALED", attackerCard: "other/card#9", defenderCard: "other/card#8" }]
    );
    expect(frozen?.attackerCard?.instance).toBe("king-kong/clobber#1");
    expect(frozen?.defenderCard?.instance).toBe("baba-yaga/dodge#1");
  });

  it("leaves the defense slot empty when the defender declined (null in CARDS_REVEALED)", () => {
    const prev = view({
      combat: combat({ stage: "COMMIT_DEFENSE", attackerCard: null, defenderCard: null }),
      catalog: { "king-kong/clobber": { title: "Clobber", type: "attack", value: 4, boost: 2 } },
    });
    const events: GameEvent[] = [
      { type: "CARDS_REVEALED", attackerCard: "king-kong/clobber#1", defenderCard: null },
      { type: "COMBAT_DAMAGE", amount: 4 },
      { type: "COMBAT_RESOLVED", outcome: "ATTACKER_WON" },
      { type: "COMBAT_ENDED" },
    ];
    const frozen = captureLingeringCombat(
      prev,
      { key: "k", variant: "win", damage: 4, outcome: "ATTACKER_WON", suppressStrike: false },
      events
    );
    expect(frozen?.attackerCard?.instance).toBe("king-kong/clobber#1");
    expect(frozen?.defenderCard).toBeNull();
  });

  it("keeps the base outcome/damage when no strike descriptor rides along (end-in-a-later-batch)", () => {
    const prev = view({
      combat: combat({ stage: "AFTER", outcome: "ATTACKER_WON", attackDamageDealt: 3 }),
    });
    const frozen = captureLingeringCombat(prev, null, []);
    expect(frozen?.outcome).toBe("ATTACKER_WON");
    expect(frozen?.attackDamageDealt).toBe(3);
    expect(frozen?.stage).toBe("CLEANUP");
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

  it("lingers the resolved combat; a NEW combat that already shows a face takes the panel at once", () => {
    const { result, rerender } = renderHook((props: { s: ReturnType<typeof snap> }) => useCombatStrike(props.s), {
      initialProps: { s: snap(view({ combat: combat({ stage: "DURING" }) })) },
    });

    // Combat resolves + ends in one batch → panel should linger.
    act(() => rerender({ s: snap(view({ combat: null }), resolvedEnded("ATTACKER_WON", 2)) }));
    expect(result.current.lingeringCombat).not.toBeNull();
    expect(result.current.lingeringCombat?.attackDamageDealt).toBe(2);

    // A brand-new live combat arrives before the linger TTL carrying a revealed
    // attacker face — a resolving combat outranks the frozen one, so no hold (#602).
    const fresh = combat({ stage: "COMMIT_DEFENSE", attackerCard: card("king-kong/uppercut#7"), defenderCard: null });
    act(() => rerender({ s: snap(view({ combat: fresh })) }));
    expect(result.current.lingeringCombat).toBeNull();
  });

  it("lingers the panel for a Feint that ends combat WITHOUT firing a strike (issue #147)", () => {
    const { result, rerender } = renderHook((props: { s: ReturnType<typeof snap> }) => useCombatStrike(props.s), {
      initialProps: { s: snap(view({ combat: combat({ stage: "DAMAGE" }) })) },
    });

    // Attack answered by a Feint that cancels effects and ENDS the combat in one batch.
    const feint: GameEvent[] = [
      ...resolvedEnded("ATTACKER_WON", 2),
      { type: "EFFECT_CANCELED", role: "DEFENSE", scope: "TEXT", card: null, voided: true, boostVoided: false },
    ];
    act(() => rerender({ s: snap(view({ combat: null }), feint) }));

    // The strike beat is suppressed (the Snuff callout owns the slam)...
    expect(result.current.strike).toBeNull();
    // ...but the panel still lingers with both cards' resolved outcome + damage.
    expect(result.current.lingeringCombat).not.toBeNull();
    expect(result.current.lingeringCombat?.attackDamageDealt).toBe(2);
    expect(result.current.lingeringCombat?.outcome).toBe("ATTACKER_WON");
    expect(result.current.lingeringCombat?.attackerCard?.instance).toBe("king-kong/clobber#1");
    expect(result.current.lingeringCombat?.defenderCard?.instance).toBe("baba-yaga/dodge#1");

    // The linger clears itself after the TTL.
    act(() => jest.advanceTimersByTime(LINGER_TTL_MS + 20));
    expect(result.current.lingeringCombat).toBeNull();
  });

  // Root cause A of #517 at the hook level: commit → reveal → resolve → end in ONE
  // server drive (declined defense / bot batch). The pre-reveal combat is all the hook
  // has to freeze, so the panel used to linger a BLANK card while damage flew out of it.
  it("lingers with BOTH revealed faces when the whole combat arrives in one batch (#517)", () => {
    const preReveal = view({
      combat: combat({ stage: "COMMIT_DEFENSE", attackerCard: null, defenderCard: null }),
      catalog: {
        "king-kong/clobber": { title: "Clobber", type: "attack", value: 4, boost: 2 },
        "baba-yaga/dodge": { title: "Dodge", type: "defense", value: 1, boost: 3 },
      },
    });
    const { result, rerender } = renderHook((props: { s: ReturnType<typeof snap> }) => useCombatStrike(props.s), {
      initialProps: { s: snap(preReveal) },
    });

    act(() => rerender({ s: snap(view({ combat: null }), resolvedEnded("ATTACKER_WON", 3)) }));

    expect(result.current.lingeringCombat?.attackerCard?.instance).toBe("king-kong/clobber#1");
    expect(result.current.lingeringCombat?.defenderCard?.instance).toBe("baba-yaga/dodge#1");
    expect(result.current.lingeringCombat?.attackDamageDealt).toBe(3);
    expect(result.current.lingeringCombat?.outcome).toBe("ATTACKER_WON");
  });

  // Root cause B of #517: the combat RESOLVES in batch A (outcome stamped, combat
  // survives for AFTER-window prompts) and ENDS in a later batch B. B carries no
  // resolve event and no outcome transition, so the panel used to unmount instantly.
  it("lingers when the combat ENDS in a later batch than it resolved (#517)", () => {
    const { result, rerender } = renderHook((props: { s: ReturnType<typeof snap> }) => useCombatStrike(props.s), {
      initialProps: { s: snap(view({ combat: combat({ stage: "DAMAGE", outcome: null }) })) },
    });

    // Batch A — resolves, combat survives (AFTER window). Strike fires, no linger yet.
    const resolvedA = view({
      combat: combat({ stage: "AFTER", outcome: "ATTACKER_WON", attackDamageDealt: 2 }),
    });
    act(() =>
      rerender({
        s: snap(resolvedA, [
          { type: "COMBAT_DAMAGE", amount: 2 },
          { type: "COMBAT_RESOLVED", outcome: "ATTACKER_WON" },
        ]),
      })
    );
    expect(result.current.strike?.variant).toBe("win");
    expect(result.current.lingeringCombat).toBeNull();

    // Batch B — cleanup drive: the combat just disappears. The panel must still linger.
    act(() => rerender({ s: snap(view({ combat: null }), [{ type: "COMBAT_ENDED" }]) }));
    expect(result.current.lingeringCombat).not.toBeNull();
    expect(result.current.lingeringCombat?.outcome).toBe("ATTACKER_WON");
    expect(result.current.lingeringCombat?.attackDamageDealt).toBe(2);
    expect(result.current.lingeringCombat?.attackerCard?.instance).toBe("king-kong/clobber#1");
    expect(result.current.lingeringCombat?.defenderCard?.instance).toBe("baba-yaga/dodge#1");

    // …and it outlives the damage arc landing + the token beat before clearing.
    act(() => jest.advanceTimersByTime(ARC_LAUNCH_MS + ARC_FLIGHT_MS + DAMAGE_BEAT_MS));
    expect(result.current.lingeringCombat).not.toBeNull();
    act(() => jest.advanceTimersByTime(LINGER_TTL_MS));
    expect(result.current.lingeringCombat).toBeNull();
  });

  it("does not re-fire the strike when the later end batch arrives", () => {
    const { result, rerender } = renderHook((props: { s: ReturnType<typeof snap> }) => useCombatStrike(props.s), {
      initialProps: { s: snap(view({ combat: combat({ stage: "DAMAGE", outcome: null }) })) },
    });
    act(() =>
      rerender({
        s: snap(view({ combat: combat({ stage: "AFTER", outcome: "ATTACKER_WON", attackDamageDealt: 2 }) }), [
          { type: "COMBAT_RESOLVED", outcome: "ATTACKER_WON" },
        ]),
      })
    );
    const first = result.current.strike;
    act(() => rerender({ s: snap(view({ combat: null }), [{ type: "COMBAT_ENDED" }]) }));
    expect(result.current.strike).toBe(first);
  });

  // Issue #545: a Doppelgänger stalemate that resolves in batch A and ENDS in a
  // later batch B must still linger. The old `prevOutcome !== "UNKNOWN"` guard read
  // a real no-winner outcome as "never resolved" and unmounted the panel instantly.
  it("lingers a no-winner (UNKNOWN) combat that ends in a later batch", () => {
    const { result, rerender } = renderHook((props: { s: ReturnType<typeof snap> }) => useCombatStrike(props.s), {
      initialProps: { s: snap(view({ combat: combat({ stage: "DAMAGE", outcome: null }) })) },
    });
    // Batch A — resolves UNKNOWN, combat survives for the AFTER window.
    act(() =>
      rerender({
        s: snap(view({ combat: combat({ stage: "AFTER", outcome: "UNKNOWN", attackDamageDealt: 0 }) }), [
          { type: "COMBAT_RESOLVED", outcome: "UNKNOWN" },
        ]),
      })
    );
    expect(result.current.strike?.variant).toBe("tie");
    // Batch B — cleanup drive: the combat just disappears. The panel must linger.
    act(() => rerender({ s: snap(view({ combat: null }), [{ type: "COMBAT_ENDED" }]) }));
    expect(result.current.lingeringCombat).not.toBeNull();
    expect(result.current.lingeringCombat?.outcome).toBe("UNKNOWN");
  });

  it("does NOT linger a combat that vanishes without ever resolving", () => {
    const { result, rerender } = renderHook((props: { s: ReturnType<typeof snap> }) => useCombatStrike(props.s), {
      initialProps: { s: snap(view({ combat: combat({ stage: "COMMIT_DEFENSE", outcome: null }) })) },
    });
    act(() => rerender({ s: snap(view({ combat: null }), [{ type: "COMBAT_ENDED" }]) }));
    expect(result.current.lingeringCombat).toBeNull();
  });

  /* ------------------------------------------------------------------ #602
   * Chained attacks. The opponent commits the NEXT attack ~1-2s after the last
   * one resolved, while the previous combat's damage arc is still in the air.
   * Cancelling the linger on that COMMIT (the old rule) landed the damage number
   * on a face-down "deciding…" panel — unreadable. The takeover is HELD instead.
   * -------------------------------------------------------------------------- */

  /** The next attack's commit stage: both faces still hidden, nothing resolved. */
  const nextCommit = () =>
    combat({ stage: "COMMIT_DEFENSE", attackerCard: null, defenderCard: null, outcome: null });

  it("holds the frozen panel through a chained attack's COMMIT until the arc + beat land (#602)", () => {
    const { result, rerender } = renderHook((props: { s: ReturnType<typeof snap> }) => useCombatStrike(props.s), {
      initialProps: { s: snap(view({ combat: combat({ stage: "DURING" }) })) },
    });

    // Combat 1 resolves + ends → freeze. The damage arc starts flying now.
    act(() => rerender({ s: snap(view({ combat: null }), resolvedEnded("ATTACKER_WON", 2)) }));
    const frozen = result.current.lingeringCombat;
    expect(frozen).not.toBeNull();
    expect(result.current.lingerHold).toBe(false);

    // Combat 2's COMMIT arrives mid-arc. The panel must NOT flip to it yet.
    act(() => jest.advanceTimersByTime(1200));
    const live = nextCommit();
    act(() => rerender({ s: snap(view({ combat: live })) }));
    expect(result.current.lingerHold).toBe(true);
    expect(result.current.lingeringCombat).toBe(frozen);
    expect(panelCombatFor(live, result.current.lingeringCombat, result.current.lingerHold)).toBe(frozen);

    // Still held while the arc is in the air and its damage beat pops...
    act(() => jest.advanceTimersByTime(ARC_LAUNCH_MS + ARC_FLIGHT_MS - 1200));
    expect(result.current.lingerHold).toBe(true);
    expect(result.current.lingeringCombat).toBe(frozen);

    // ...and released once the beat has landed — the live combat takes the panel.
    act(() => jest.advanceTimersByTime(DAMAGE_BEAT_MS + 20));
    expect(result.current.lingerHold).toBe(false);
    expect(result.current.lingeringCombat).toBeNull();
    expect(panelCombatFor(live, result.current.lingeringCombat, result.current.lingerHold)).toBe(live);
  });

  it("collapses the hold the moment the NEW combat reveals (#602)", () => {
    const { result, rerender } = renderHook((props: { s: ReturnType<typeof snap> }) => useCombatStrike(props.s), {
      initialProps: { s: snap(view({ combat: combat({ stage: "DURING" }) })) },
    });
    act(() => rerender({ s: snap(view({ combat: null }), resolvedEnded("ATTACKER_WON", 2)) }));

    // Combat 2 commits face-down → held.
    act(() => jest.advanceTimersByTime(600));
    act(() => rerender({ s: snap(view({ combat: nextCommit() })) }));
    expect(result.current.lingerHold).toBe(true);

    // Combat 2 reveals a beat later (bot instant-drive): the stale faces must go
    // NOW rather than sit on top of a combat that is already resolving.
    const revealed = combat({
      stage: "DURING",
      attackerCard: card("king-kong/uppercut#7"),
      defenderCard: card("baba-yaga/parry#4", { role: "DEFENSE" }),
    });
    act(() =>
      rerender({
        s: snap(view({ combat: revealed }), [
          { type: "CARDS_REVEALED", attackerCard: "king-kong/uppercut#7", defenderCard: "baba-yaga/parry#4" },
        ]),
      })
    );
    expect(result.current.lingerHold).toBe(false);
    expect(result.current.lingeringCombat).toBeNull();
    expect(panelCombatFor(revealed, result.current.lingeringCombat, result.current.lingerHold)).toBe(revealed);
  });

  it("does not hold a combat that commits AFTER the hold window has closed (#602)", () => {
    const { result, rerender } = renderHook((props: { s: ReturnType<typeof snap> }) => useCombatStrike(props.s), {
      initialProps: { s: snap(view({ combat: combat({ stage: "DURING" }) })) },
    });
    act(() => rerender({ s: snap(view({ combat: null }), resolvedEnded("ATTACKER_WON", 2)) }));

    // Past the hold window but still inside the linger's own TTL (the settle dwell).
    act(() => jest.advanceTimersByTime(LINGER_HOLD_MS + 20));
    expect(result.current.lingeringCombat).not.toBeNull();
    act(() => rerender({ s: snap(view({ combat: nextCommit() })) }));
    expect(result.current.lingerHold).toBe(false);
    expect(result.current.lingeringCombat).toBeNull();
  });

  it("freezes the NEW combat cleanly when it resolves during the previous hold (#602)", () => {
    const { result, rerender } = renderHook((props: { s: ReturnType<typeof snap> }) => useCombatStrike(props.s), {
      initialProps: { s: snap(view({ combat: combat({ stage: "DURING" }) })) },
    });
    act(() => rerender({ s: snap(view({ combat: null }), resolvedEnded("ATTACKER_WON", 2)) }));
    act(() => jest.advanceTimersByTime(500));
    act(() => rerender({ s: snap(view({ combat: nextCommit() })) }));
    expect(result.current.lingerHold).toBe(true);

    // Combat 2 resolves + ends in one batch while combat 1 was still holding: its
    // OWN snapshot replaces the frozen one, unheld, on a fresh hold window.
    const second: GameEvent[] = [
      { type: "CARDS_REVEALED", attackerCard: "king-kong/uppercut#7", defenderCard: null },
      { type: "COMBAT_DAMAGE", amount: 5 },
      { type: "COMBAT_RESOLVED", outcome: "ATTACKER_WON" },
      { type: "COMBAT_ENDED" },
    ];
    act(() => rerender({ s: snap(view({ combat: null }), second) }));
    expect(result.current.lingerHold).toBe(false);
    expect(result.current.lingeringCombat?.attackerCard?.instance).toBe("king-kong/uppercut#7");
    expect(result.current.lingeringCombat?.attackDamageDealt).toBe(5);
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

/**
 * #602's invariant, the same rule #520 set for `LINGER_TTL_MS`: the hold window is
 * DERIVED from the arc's clock, never hand-tuned. These fail the moment someone
 * types a number into it.
 */
describe("the linger hold window", () => {
  it("is exactly the arc's flight plus the token-side damage beat", () => {
    expect(LINGER_HOLD_MS).toBe(ARC_LAUNCH_MS + ARC_FLIGHT_MS + DAMAGE_BEAT_MS);
  });

  it("outlives the damage arc landing — the whole point of holding", () => {
    expect(LINGER_HOLD_MS).toBeGreaterThan(ARC_LAUNCH_MS + ARC_FLIGHT_MS);
  });

  it("never outlives the linger it rides on (the hold is bounded)", () => {
    expect(LINGER_HOLD_MS).toBeLessThanOrEqual(LINGER_TTL_MS);
    // It drops exactly the settle dwell: when the next attack is already committed,
    // that commit IS the settle — so the delay a player actually feels is bounded by
    // the hold minus however long the commit took to arrive.
    expect(LINGER_TTL_MS - LINGER_HOLD_MS).toBe(SETTLE_DWELL_MS);
  });
});

describe("panelCombatFor", () => {
  const live = combat({ stage: "COMMIT_DEFENSE", attackerCard: null, defenderCard: null });
  const frozen = combat({ stage: "CLEANUP", outcome: "ATTACKER_WON", attackDamageDealt: 3 });

  it("renders the live combat when nothing is held (today's behavior)", () => {
    expect(panelCombatFor(live, frozen, false)).toBe(live);
    expect(panelCombatFor(live, null, false)).toBe(live);
  });

  it("renders the frozen combat while the takeover is held", () => {
    expect(panelCombatFor(live, frozen, true)).toBe(frozen);
  });

  it("falls back to the linger with no live combat, and to nothing at all", () => {
    expect(panelCombatFor(null, frozen, false)).toBe(frozen);
    expect(panelCombatFor(null, null, true)).toBeNull();
  });
});

describe("combatHasRevealed", () => {
  const commitStage = combat({ stage: "COMMIT_DEFENSE", attackerCard: null, defenderCard: null });

  it("is false for a face-down commit stage — exactly what a hold may cover", () => {
    expect(combatHasRevealed(commitStage, [])).toBe(false);
    expect(combatHasRevealed(combat({ stage: "COMMIT_ATTACK", attackerCard: null, defenderCard: null }), [])).toBe(
      false
    );
  });

  it("is true on the revealing/resolving batch even before the view catches up", () => {
    expect(
      combatHasRevealed(commitStage, [
        { type: "CARDS_REVEALED", attackerCard: "king-kong/clobber#1", defenderCard: null },
      ])
    ).toBe(true);
    expect(combatHasRevealed(commitStage, [{ type: "COMBAT_DAMAGE", amount: 2 }])).toBe(true);
    expect(combatHasRevealed(commitStage, [{ type: "COMBAT_RESOLVED", outcome: "ATTACKER_WON" }])).toBe(true);
  });

  it("is true once the view carries a face, an outcome, or a post-commit stage", () => {
    expect(combatHasRevealed(combat({ stage: "COMMIT_DEFENSE", defenderCard: null }), [])).toBe(true);
    expect(
      combatHasRevealed(combat({ stage: "COMMIT_DEFENSE", attackerCard: null, defenderCard: null, outcome: "UNKNOWN" }), [])
    ).toBe(true);
    expect(combatHasRevealed(combat({ stage: "DURING", attackerCard: null, defenderCard: null }), [])).toBe(true);
  });
});
