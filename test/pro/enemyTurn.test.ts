import {
  enemyTurnArrow,
  enemyTurnModel,
  enemyTurnSummary,
  nextEnemyTurnState,
} from "@/lib/pro/enemyTurn";
import { teamChoosingTitle } from "@/lib/pro/adventureCopy";
import type { GameEvent, PlayerView } from "@/lib/pro/protocol";

const fighter = (id: string, name: string, extra: object = {}) => ({
  id, owner: "p1", kind: "HERO", name, space: "a", tailSpace: null, hp: 10, maxHp: 12,
  reach: "MELEE", size: "NORMAL", defeated: false, ...extra,
});
const VIEW = {
  fighters: [
    fighter("p1/hero", "Hero"),
    fighter("e1/rex", "Indominus Rex", {
      size: "LARGE",
      enemy: { role: "VILLAIN", enemyId: "rex", move: 3, deckCount: 5, discardTop: null },
    }),
  ],
  scenario: { id: "x", label: "X", threat: { position: 3, level: 4, overflows: 0, positions: [] }, objectives: [] },
  catalog: { claw: { title: "Claw Swipe", type: "attack", value: 4, boost: null } },
} as unknown as PlayerView;

const act = (outcome: string, target?: string) =>
  ({ type: "ENEMY_ACTIVATION", fighter: "e1/rex", outcome, target }) as GameEvent;
const lit = (events: GameEvent[]) =>
  enemyTurnModel(events, VIEW)!.steps.filter((s) => s.lit).map((s) => s.n);

describe("enemyTurnModel", () => {
  it("ADJACENT lights step 1 with target and attack card", () => {
    const m = enemyTurnModel(
      [act("ADJACENT", "p1/hero"), { type: "ATTACK_DECLARED", attacker: "e1/rex", target: "p1/hero" },
        { type: "CARDS_REVEALED", attackerCard: "claw#1", defenderCard: null }] as GameEvent[],
      VIEW,
    )!;
    expect(lit([act("ADJACENT", "p1/hero")])).toEqual([1]);
    expect(m.targetName).toBe("Hero");
    expect(m.consequence).toBe("attacks Hero");
    expect(m.attack).toEqual({ cardId: "claw", title: "Claw Swipe", value: 4, defender: "Hero" });
    expect(m.moveLine).toBe("MOVE 3 · hits from 2 away");
  });
  it("CLOSEST lights step 2", () => {
    expect(lit([act("CLOSEST", "p1/hero")])).toEqual([2]);
    expect(enemyTurnModel([act("CLOSEST", "p1/hero")], VIEW)!.consequence).toBe("moves toward Hero, attacks");
  });
  it("NO_TARGET lights step 3, threat +1 (now N), no target/attack", () => {
    const m = enemyTurnModel([act("NO_TARGET")], VIEW)!;
    expect(m.steps.filter((s) => s.lit).map((s) => s.n)).toEqual([3]);
    expect(m.consequence).toBe("threat +1 (now 4)");
    expect(m.targetId).toBeNull();
    expect(m.attack).toBeNull();
    expect(enemyTurnSummary(m)).toBe("Indominus Rex: threat +1 (now 4)");
  });
  it("is null without an activation", () => {
    expect(enemyTurnModel([], VIEW)).toBeNull();
  });
});

describe("nextEnemyTurnState", () => {
  it("persists across batches, fills the attack later, collapses on TURN_STARTED", () => {
    let s = nextEnemyTurnState(null, [act("ADJACENT", "p1/hero")], VIEW);
    expect(enemyTurnArrow(s)).toEqual({ attacker: "e1/rex", target: "p1/hero" });
    s = nextEnemyTurnState(s, [
      { type: "ATTACK_DECLARED", attacker: "e1/rex", target: "p1/hero" },
      { type: "CARDS_REVEALED", attackerCard: "claw#1", defenderCard: null },
    ] as GameEvent[], VIEW);
    expect(s!.model.attack?.title).toBe("Claw Swipe");
    expect(s!.collapsed).toBe(false);
    s = nextEnemyTurnState(s, [{ type: "TURN_STARTED", player: "p1", turnNumber: 2 }] as GameEvent[], VIEW);
    expect(s!.collapsed).toBe(true);
    expect(enemyTurnArrow(s)).toBeNull();
    s = nextEnemyTurnState(s, [act("NO_TARGET")], VIEW);
    expect(s!.collapsed).toBe(false);
    expect(enemyTurnArrow(s)).toBeNull();
  });
});

describe("teamChoosingTitle", () => {
  it("frames the chooser and teammates", () => {
    expect(teamChoosingTitle(true, "You", "Rex", "pick a target")).toBe("You're choosing for Rex: pick a target");
    expect(teamChoosingTitle(false, "Sam", "Rex", "pick a target")).toBe("Sam is choosing for Rex");
  });
});
