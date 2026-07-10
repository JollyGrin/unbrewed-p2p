/**
 * Deterministic sample views for the render fuzz (unbrewed-p2p-179).
 *
 * These stand in for the engine export step's real `redactFor()` output so the
 * harness runs end-to-end today (before unbrewed-engine's emitter lands) and so
 * the Jest regression test has known-good and known-bad inputs. Hand-built from
 * the real protocol types + the real MULTIPLAYER_PLAYTEST_MAP — no LLM, no
 * server, fully reproducible.
 */
import type { PlayerView, ViewFighter } from "@/lib/pro/protocol";
import { MULTIPLAYER_PLAYTEST_MAP } from "@/lib/pro/multiplayerPlaytest";

const CATALOG = {
  "hero-a/strike": { title: "Strike", type: "attack" as const, value: 3, boost: 2 },
  "hero-a/guard": { title: "Guard", type: "defense" as const, value: 2, boost: 3 },
  "hero-b/volley": { title: "Volley", type: "attack" as const, value: 4, boost: 1 },
  "hero-b/dodge": { title: "Dodge", type: "defense" as const, value: 1, boost: 4 },
};

const fighter = (over: Partial<ViewFighter> & Pick<ViewFighter, "id" | "owner" | "name" | "space">): ViewFighter => ({
  kind: "HERO",
  tailSpace: null,
  hp: 10,
  maxHp: 10,
  reach: "MELEE",
  defeated: false,
  ...over,
});

/** A clean, fully-populated 2-seat PLAY view that renders without throwing. */
export function buildBaselineView(overrides: Partial<PlayerView> = {}): PlayerView {
  return {
    you: "p1",
    phase: "PLAY",
    turnNumber: 2,
    activePlayer: "p1",
    actionsRemaining: 2,
    turnPhase: "ACTION_SELECT",
    maneuver: null,
    map: MULTIPLAYER_PLAYTEST_MAP,
    catalog: CATALOG,
    fighters: [
      fighter({ id: "p1/hero", owner: "p1", name: "Alpha", space: "w1", hp: 9, maxHp: 12, reach: "MELEE" }),
      fighter({ id: "p2/hero", owner: "p2", name: "Beta", space: "e1", hp: 7, maxHp: 10, reach: "RANGED" }),
    ],
    tokens: [],
    self: {
      id: "p1",
      heroId: "hero-a",
      hand: ["hero-a/strike#1", "hero-a/guard#1"],
      deckCount: 18,
      discard: ["hero-a/strike#2"],
      committedCard: null,
      counters: {},
    },
    opponent: {
      id: "p2",
      heroId: "hero-b",
      handCount: 5,
      deckCount: 17,
      discard: ["hero-b/dodge#1"],
      hasCommitted: false,
      counters: {},
    },
    players: [
      {
        id: "p1",
        heroId: "hero-a",
        you: true,
        hand: ["hero-a/strike#1", "hero-a/guard#1"],
        handCount: 2,
        deckCount: 18,
        discard: ["hero-a/strike#2"],
        committedCard: null,
        hasCommitted: false,
        counters: {},
      },
      {
        id: "p2",
        heroId: "hero-b",
        you: false,
        handCount: 5,
        deckCount: 17,
        discard: ["hero-b/dodge#1"],
        hasCommitted: false,
        counters: {},
      },
    ],
    combat: null,
    prompt: null,
    closedRegions: [],
    canUndo: false,
    winner: null,
    ...overrides,
  };
}

export interface SampleStep {
  seat: string;
  step: number;
  view: PlayerView;
}

/**
 * A short, deterministic per-seat view sequence for one game — enough steps and
 * both seats to exercise the sweep, sampling, and per-seat redaction shapes.
 */
export function buildSampleGame(): SampleStep[] {
  const steps: SampleStep[] = [];

  // Seat A1 across three turns: setup-ish → mid-combat → maneuver.
  steps.push({ seat: "p1", step: 0, view: buildBaselineView({ turnNumber: 1, activePlayer: "p1" }) });
  steps.push({
    seat: "p1",
    step: 1,
    view: buildBaselineView({
      turnNumber: 2,
      activePlayer: "p1",
      combat: {
        attackerPlayer: "p1",
        defenderPlayer: "p2",
        attacker: "p1/hero",
        target: "p2/hero",
        stage: "COMMIT_DEFENSE",
        attackerCard: { instance: "hero-a/strike#1", role: "ATTACK", boosts: [], effectiveValue: 3 },
        defenderCard: null,
        outcome: null,
        attackDamageDealt: null,
      },
    }),
  });
  steps.push({
    seat: "p1",
    step: 2,
    view: buildBaselineView({
      turnNumber: 3,
      activePlayer: "p1",
      turnPhase: "MANEUVER_MOVE",
      maneuver: { boostApplied: 2, boosted: true, moved: ["p1/hero"] },
      fighters: [
        fighter({ id: "p1/hero", owner: "p1", name: "Alpha", space: "c5", hp: 9, maxHp: 12 }),
        fighter({ id: "p2/hero", owner: "p2", name: "Beta", space: "e4", hp: 4, maxHp: 10, reach: "RANGED" }),
      ],
    }),
  });

  // Seat B1's redacted view of the same match (own hand visible, A1 hidden).
  const b1 = buildBaselineView({
    you: "p2",
    activePlayer: "p1",
    self: {
      id: "p2",
      heroId: "hero-b",
      hand: ["hero-b/volley#1", "hero-b/dodge#2"],
      deckCount: 17,
      discard: ["hero-b/dodge#1"],
      committedCard: null,
      counters: {},
    },
    opponent: {
      id: "p1",
      heroId: "hero-a",
      handCount: 2,
      deckCount: 18,
      discard: ["hero-a/strike#2"],
      hasCommitted: false,
      counters: {},
    },
    players: [
      {
        id: "p2",
        heroId: "hero-b",
        you: true,
        hand: ["hero-b/volley#1", "hero-b/dodge#2"],
        handCount: 2,
        deckCount: 17,
        discard: ["hero-b/dodge#1"],
        committedCard: null,
        hasCommitted: false,
        counters: {},
      },
      {
        id: "p1",
        heroId: "hero-a",
        you: false,
        handCount: 2,
        deckCount: 18,
        discard: ["hero-a/strike#2"],
        hasCommitted: false,
        counters: {},
      },
    ],
  });
  steps.push({ seat: "p2", step: 0, view: b1 });

  return steps;
}

/**
 * A view hand-mutated to trigger a render throw — the harness's own regression
 * fixture. `fighters` is nulled, emulating a malformed / partially-redacted
 * server payload (the Hollow-Oak class): the board maps over `fighters` during
 * render, so `null.filter(...)` throws deep in the tree and must be CAUGHT as a
 * finding rather than crashing the process.
 */
export function knownBadView(): PlayerView {
  return buildBaselineView({ fighters: null as unknown as ViewFighter[] });
}
