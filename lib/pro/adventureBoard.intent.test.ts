/**
 * Enemy intent badge model (p2p #1148 / engine #734): the per-enemy prediction line read off
 * `scenario.enemyIntents`, phrased for the dial. Fixture-driven, no engine.
 */
import { adventureBoardModel, enemyIntentLine } from "./adventureBoard";
import type { EnemyIntent, PlayerView } from "./protocol";

const fighter = (id: string, name: string, extra: object = {}) => ({
  id,
  owner: "p1",
  kind: "HERO",
  name,
  space: "a",
  tailSpace: null,
  hp: 10,
  maxHp: 12,
  reach: "MELEE",
  size: "NORMAL",
  defeated: false,
  ...extra,
});

const enemy = (id: string, name: string, enemyId: string, extra: object = {}) =>
  fighter(id, name, { kind: "SIDEKICK", owner: "e", enemy: { role: "MINION", enemyId, move: 2, deckCount: 3, discardTop: null }, ...extra });

const view = (phase: string, enemyIntents: EnemyIntent[] | undefined, extraFighters: object[] = []): PlayerView =>
  ({
    phase,
    fighters: [
      fighter("p1/hero", "Dr. Sattler"),
      enemy("e1/raptor", "Velociraptor", "velociraptor"),
      enemy("e2/dilo", "Dilophosaurus", "dilophosaurus"),
      ...extraFighters,
    ],
    players: [{ id: "p1", displayName: "Dean" }],
    scenario: {
      id: "isla-nublar",
      label: "Isla Nublar",
      threat: { position: 0, level: 0, overflows: 0, positions: [0, 1, 2] },
      objectives: [],
      ...(enemyIntents ? { enemyIntents } : {}),
    },
  }) as unknown as PlayerView;

describe("enemyIntentLine", () => {
  const v = view("PLAY", undefined);
  it("phrases the four outcomes, hedged, naming the target by its fighter name", () => {
    expect(enemyIntentLine(v, { fighter: "e1/raptor", outcome: "ATTACK", target: "p1/hero" })).toBe("plans to attack Dr. Sattler");
    expect(enemyIntentLine(v, { fighter: "e1/raptor", outcome: "MOVE_THEN_ATTACK", target: "p1/hero", move: 2 })).toBe(
      "plans to move to Dr. Sattler and attack",
    );
    expect(enemyIntentLine(v, { fighter: "e1/raptor", outcome: "NO_TARGET" })).toBe("no target");
    expect(enemyIntentLine(v, { fighter: "e1/raptor", outcome: "PLAYERS_CHOOSE" })).toBe("players choose");
  });
  it("never asserts the no-target consequence (some enemies ship an empty box) and never says 'will'", () => {
    for (const outcome of ["ATTACK", "MOVE_THEN_ATTACK", "NO_TARGET", "PLAYERS_CHOOSE"] as const) {
      const line = enemyIntentLine(v, { fighter: "e1/raptor", outcome, target: "p1/hero" }) ?? "";
      expect(line).not.toMatch(/will|threat/i);
    }
  });
  it("attack-each with no settled target still reads as an attack", () => {
    expect(enemyIntentLine(v, { fighter: "e1/raptor", outcome: "ATTACK" })).toBe("plans to attack each in range");
    expect(enemyIntentLine(v, { fighter: "e1/raptor", outcome: "MOVE_THEN_ATTACK", move: 1 })).toBe("plans to move, then attack");
  });
  it("resolves a target through the dial roster by enemy id too, and never prints a raw id (#1473)", () => {
    expect(enemyIntentLine(v, { fighter: "e1/raptor", outcome: "ATTACK", target: "dilophosaurus" })).toBe("plans to attack Dilophosaurus");
    // a fighter the placement prompt has not put on the board yet, from a seat the view does not know
    expect(enemyIntentLine(v, { fighter: "e1/raptor", outcome: "MOVE_THEN_ATTACK", target: "e9/spawn" })).toBe(
      "plans to move to a hero and attack",
    );
    // … and from a seat it does know: the seat label (claimed name, else "P2"), never "p2/hero"
    const two = view("PLAY", undefined);
    (two as unknown as { players: object[] }).players = [{ id: "p1", displayName: "Dean" }, { id: "p2", displayName: "Bo" }, { id: "p3" }];
    expect(enemyIntentLine(two, { fighter: "e1/raptor", outcome: "ATTACK", target: "p2/hero" })).toBe("plans to attack Bo");
    expect(enemyIntentLine(two, { fighter: "e1/raptor", outcome: "ATTACK", target: "p3/hero" })).toBe("plans to attack P3");
    for (const target of ["e9/spawn", "p2/hero", "p3/hero", "p9/hero"]) {
      expect(enemyIntentLine(two, { fighter: "e1/raptor", outcome: "ATTACK", target })).not.toContain("/");
    }
  });
  it("two copies of the same hero read with their seat, so the target is never ambiguous", () => {
    const twins = view("PLAY", undefined, [fighter("p2/hero", "Dr. Sattler", { owner: "p2" })]);
    (twins as unknown as { players: object[] }).players = [{ id: "p1", displayName: "Dean" }, { id: "p2" }];
    expect(enemyIntentLine(twins, { fighter: "e1/raptor", outcome: "ATTACK", target: "p1/hero" })).toBe("plans to attack Dr. Sattler (Dean)");
    expect(enemyIntentLine(twins, { fighter: "e1/raptor", outcome: "ATTACK", target: "p2/hero" })).toBe("plans to attack Dr. Sattler (Opponent)");
    // a lone copy stays bare
    expect(enemyIntentLine(v, { fighter: "e1/raptor", outcome: "ATTACK", target: "p1/hero" })).toBe("plans to attack Dr. Sattler");
  });
  it("PLAYERS_CHOOSE keeps a settled target: the tie is on the route to it, not on the target", () => {
    expect(enemyIntentLine(v, { fighter: "e1/raptor", outcome: "PLAYERS_CHOOSE", target: "p1/hero", move: 2 })).toBe(
      "plans to move toward Dr. Sattler (players choose the route)",
    );
    expect(enemyIntentLine(v, { fighter: "e1/raptor", outcome: "PLAYERS_CHOOSE", move: 2 })).toBe("players choose");
  });
  it("renders nothing for an outcome this client does not know", () => {
    expect(enemyIntentLine(v, { fighter: "e1/raptor", outcome: "FLEE" } as unknown as EnemyIntent)).toBeNull();
  });
});

describe("adventureBoardModel enemy intents", () => {
  const intents: EnemyIntent[] = [
    { fighter: "e1/raptor", outcome: "MOVE_THEN_ATTACK", target: "p1/hero", move: 2 },
    { fighter: "e2/dilo", outcome: "NO_TARGET" },
  ];
  it("attaches one badge per living enemy dial in PLAY", () => {
    const m = adventureBoardModel(view("PLAY", intents))!;
    expect(m.enemies.map((e) => [e.id, e.intent])).toEqual([
      ["e1/raptor", "plans to move to Dr. Sattler and attack"],
      ["e2/dilo", "no target"],
    ]);
  });
  it("hides the badge in SETUP, for a defeated enemy, and when the server sends no preview", () => {
    expect(adventureBoardModel(view("SETUP", intents))!.enemies.map((e) => e.intent)).toEqual([null, null]);
    expect(adventureBoardModel(view("PLAY", undefined))!.enemies.map((e) => e.intent)).toEqual([null, null]);
    const down = view("PLAY", intents);
    (down.fighters[1] as { defeated: boolean }).defeated = true;
    expect(adventureBoardModel(down)!.enemies.map((e) => e.intent)).toEqual([null, "no target"]);
  });
  it("an enemy without a row (its dry run threw server-side) simply has no badge", () => {
    const m = adventureBoardModel(view("PLAY", [intents[1]]))!;
    expect(m.enemies.map((e) => e.intent)).toEqual([null, "no target"]);
  });
});
