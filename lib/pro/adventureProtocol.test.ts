import type { ClientMsg, GameEvent, ViewFighter } from "./protocol";

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
});
