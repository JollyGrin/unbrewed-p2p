import type { ActivationAnchor, ClientMsg, GameEvent, ScenarioListing, ServerMsg, ViewFighter, ViewToken } from "./protocol";

// Engine Wave 1 adventure additions (engine #587/#589/#590/#595) — additive optional wire fields.
// These are compile-time checks: a drift from the engine's protocol.ts fails `tsc`, not just jest.
describe("adventure protocol additions", () => {
  it("CREATE_ROOM carries humans, and stays valid without it", () => {
    const withHumans: ClientMsg = { v: 34, type: "CREATE_ROOM", heroId: "a", formatId: "adventure", humans: 3 };
    const without: ClientMsg = { v: 34, type: "CREATE_ROOM", heroId: "a" };
    expect((withHumans as { humans?: number }).humans).toBe(3);
    expect((without as { humans?: number }).humans).toBeUndefined();
  });

  it("models the enemy / threat / initiative events", () => {
    const events: GameEvent[] = [
      { type: "ROUND_STARTED", round: 1 },
      { type: "INITIATIVE_REVEALED", card: "c", entry: "FIGHTER" },
      { type: "ENEMY_ACTIVATION", fighter: "e1/rex", outcome: "NO_TARGET" },
      { type: "ENEMY_ACTIVATION", fighter: "e1/rex", outcome: "CLOSEST", target: "p1/hero" },
      { type: "ENEMY_SPAWNED", fighter: "e1/raptor-2", enemyId: "raptor", card: "raptor@e1/raptor-2" },
      { type: "ENEMY_SPAWNED", fighter: "e1/wisp", enemyId: "wisp", card: null },
      { type: "THREAT_CHANGED", position: 2, level: 1 },
      { type: "THREAT_OVERFLOW", overflows: 1, objective: null },
      { type: "ROUND_ENDED", round: 1 },
      { type: "GAME_ENDED", winner: "p1", reason: "SCENARIO_VICTORY" },
    ];
    expect(events.map((e) => e.type)).toContain("ENEMY_ACTIVATION");
  });

  it("ViewFighter.enemy is optional (absent on every player fighter)", () => {
    const enemy: NonNullable<ViewFighter["enemy"]> = { role: "VILLAIN", move: 3, deckCount: 4, discardTop: null };
    expect(enemy.role).toBe("VILLAIN");
  });

  it("engine 1.6: activation anchors on statuses are optional", () => {
    const anchor: ActivationAnchor = { fighter: "p1/hero" };
    const seat: ActivationAnchor = { seat: "p1" };
    const events: GameEvent[] = [
      { type: "FIGHTER_PINNED", fighter: "p1/hero", expiresAtTurn: null, expiresAt: null, expiresAtActivationOf: anchor, edge: "END" },
      { type: "STAT_SET", fighter: "p1/hero", stat: "MOVE", to: 0, expiresAtTurn: null, expiresAt: null, expiresAtActivationOf: seat },
      { type: "FIGHTER_PINNED", fighter: "p1/hero", expiresAtTurn: 3, expiresAt: "END" },
    ];
    expect(events).toHaveLength(3);
  });

  it("engine 2.3: scenario markers", () => {
    const tok: ViewToken = { id: "m1", kind: "marker", owner: "p1", space: "s1", identity: "pack", faceDown: true } as ViewToken;
    const events: GameEvent[] = [
      { type: "TOKEN_PLACED", token: "m1", kind: "marker", owner: "p1", space: "s1", faceDown: true },
      { type: "TOKEN_MOVED", token: "m1", kind: "marker", owner: "p1", from: "s1", to: "s2" },
      { type: "TOKEN_FLIPPED", token: "m1", kind: "marker", owner: "p1", space: "s2", faceDown: false, identity: "pack" },
    ];
    expect(tok.kind).toBe("marker");
    expect(events.map((e) => e.type)).toContain("TOKEN_FLIPPED");
  });

  it("engine #678: scenario roster on the wire", () => {
    const create: ClientMsg = { v: 34, type: "CREATE_ROOM", heroId: "a", formatId: "adventure", scenarioId: "isla", roster: { villain: null, minions: ["raptor", null] } };
    const listing: ScenarioListing = {
      id: "isla", label: "Isla", formatIds: ["adventure"], mapId: "isla", villain: "rex",
      villains: [], fixedMinions: [], minionPool: [], minionsPerPlayer: 1, duplicateMinions: false,
    };
    const reply: ServerMsg = { v: 34, type: "SCENARIOS", scenarios: [listing] };
    expect((create as { scenarioId?: string }).scenarioId).toBe("isla");
    expect(reply.type).toBe("SCENARIOS");
  });
});
