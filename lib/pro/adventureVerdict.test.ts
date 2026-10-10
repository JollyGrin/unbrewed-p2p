import { adventureEndLogLine, adventureVerdictModel, trackDefeatRounds } from "./adventureVerdict";
import type { PlayerView, ScenarioResult } from "./protocol";

const fighter = (id: string, name: string, extra: Record<string, unknown> = {}) =>
  ({ id, name, owner: id.split("/")[0], hp: 5, maxHp: 5, defeated: false, ...extra });

const view = (result: ScenarioResult | undefined, over: Record<string, unknown> = {}): PlayerView =>
  ({
    you: "p1",
    winner: result?.verdict === "VICTORY" ? "p1" : "e1",
    players: [],
    fighters: [
      fighter("p1/hero", "Kong"),
      fighter("e1/indominus", "Indominus Rex", { hp: 6, maxHp: 20, enemy: { role: "VILLAIN", move: 3, deckCount: 0, discardTop: null } }),
      fighter("e1/trex", "T. Rex", { enemy: { role: "MINION", move: 3, deckCount: 0, discardTop: null, released: true } }),
    ],
    scenario: {
      threat: { position: 1, level: 1, overflows: 4, positions: [1], bySource: { roundEnd: 19, noTarget: 9, effect: 4 } },
      objectives: [],
      releases: [
        { round: 3, fighter: "e1/trex", enemyId: "trex", spaceLabel: "2" },
        { round: 5, fighter: "e1/trex", enemyId: "trex" },
      ],
      result,
      display: { verdict: { win: "THE ISLAND IS SAFE", lose: "THE ISLAND FELL" }, setting: "the island", objectNoun: { singular: "pen", plural: "pens" } },
      ...((over.scenario as object) ?? {}),
    },
  }) as unknown as PlayerView;

const objective: ScenarioResult = { verdict: "DEFEAT", cause: { kind: "OBJECTIVE", objectiveId: "fourth-pen" }, round: 9, finalSlot: 4 };

describe("adventureVerdictModel", () => {
  it("DEFEAT by OBJECTIVE: the scenario's lose headline, villain hp, timeline with the engine's final slot", () => {
    const m = adventureVerdictModel(view(objective), { "e1/trex": 6 })!;
    expect(m.headline).toBe("THE ISLAND FELL");
    expect(m.kicker).toBe("DEFEAT · ROUND 9");
    expect(m.lines).toEqual(["Indominus Rex broke open the fourth pen.", "Indominus Rex was left at 6 of 20 health."]);
    expect(m.releases.map((t) => [t.round, t.objectLabel, t.defeatedRound, t.final])).toEqual([
      [3, "2", 6, false],
      [5, "2", 6, false],
      [9, null, null, true],
    ]);
    expect(m.releases[2].ordinal).toBe("fourth");
    expect(m.facts[0].text).toContain("Round ends 19");
  });

  it("the final tile never prints finalSlot as a space label (#1327)", () => {
    // pen 8 broke 4th: the release tiles carry printed labels, the final one only the ordinal
    const v = view(objective, {
      scenario: { releases: [{ round: 3, fighter: "e1/trex", enemyId: "trex", spaceLabel: "4" }] },
    });
    const tiles = adventureVerdictModel(v)!.releases;
    expect(tiles.map((t) => t.objectLabel)).toEqual(["4", null]);
    expect(tiles[1]).toMatchObject({ final: true, ordinal: "fourth" });
    // no finalSlot on the wire: no number at all
    const noSlot = adventureVerdictModel(view({ ...objective, finalSlot: undefined }))!.releases.at(-1)!;
    expect(noSlot).toMatchObject({ objectLabel: null, ordinal: null });
  });

  it("YOUR TEAM names the heroes who fell, with the round when it was watched (#1182)", () => {
    expect(adventureVerdictModel(view(objective))!.facts[1]).toEqual({ label: "Your team", text: "Heroes down: none." });
    const down = view(objective);
    (down.fighters[0] as { defeated: boolean }).defeated = true;
    expect(adventureVerdictModel(down, { "p1/hero": 6 })!.facts[1].text).toBe("Heroes down: Kong (R6).");
  });

  it("DEFEAT by WIPE", () => {
    const m = adventureVerdictModel(view({ verdict: "DEFEAT", cause: { kind: "WIPE" }, round: 4 }))!;
    expect(m.headline).toBe("THE HEROES FELL");
    expect(m.lines[0]).toBe("Every hero and sidekick is down.");
    expect(m.releases.some((t) => t.final)).toBe(false);
  });

  it("VICTORY says when the villain and the last released enemy fell", () => {
    const m = adventureVerdictModel(view({ verdict: "VICTORY", cause: { kind: "VICTORY_CONDITION" }, round: 8 }), { "e1/indominus": 7, "e1/trex": 8 })!;
    expect(m.headline).toBe("THE ISLAND IS SAFE");
    expect(m.lines).toEqual(["Indominus Rex fell in round 7.", "The last loose enemy, T. Rex, fell in round 8."]);
  });

  it("a scenario with no display copy gets the generic headlines", () => {
    const bare = { scenario: { display: undefined } };
    expect(adventureVerdictModel(view(objective, bare))!.headline).toBe("DEFEAT");
    expect(adventureVerdictModel(view({ verdict: "VICTORY", cause: { kind: "VICTORY_CONDITION" }, round: 8 }, bare))!.headline).toBe("VICTORY");
    expect(adventureVerdictModel(view({ ...objective, finalSlot: undefined }, bare))!.lines[0]).toBe("Indominus Rex broke open the last space.");
  });

  it("DEFEAT_CONDITION: generic headline + the briefing's lose line", () => {
    const m = adventureVerdictModel(
      view({ verdict: "DEFEAT", cause: { kind: "DEFEAT_CONDITION" }, round: 5 }, {
        scenario: { briefing: { tagline: "", objective: "", win: "", lose: "The vault was emptied." } },
      }),
    )!;
    expect(m.headline).toBe("DEFEAT");
    expect(m.lines[0]).toBe("The vault was emptied.");
  });

  it("missing result falls back (not explained); no scenario or no winner is null", () => {
    expect(adventureVerdictModel(view(undefined))!.explained).toBe(false);
    const plain = view(objective);
    delete (plain as { scenario?: unknown }).scenario;
    expect(adventureVerdictModel(plain)).toBeNull();
    expect(adventureVerdictModel({ ...view(objective), winner: null } as PlayerView)).toBeNull();
  });
});

describe("adventureEndLogLine", () => {
  it("names the scenario's setting, never a seat", () => {
    expect(adventureEndLogLine(view(objective))).toBe("Defeat — the island wins (4th pen)");
    expect(adventureEndLogLine(view({ verdict: "DEFEAT", cause: { kind: "WIPE" }, round: 2 }))).toBe("Defeat — the island wins");
    expect(adventureEndLogLine(view({ verdict: "VICTORY", cause: { kind: "VICTORY_CONDITION" }, round: 2 }))).toBe("Victory — your team wins");
    expect(adventureEndLogLine(view(undefined))).toBeNull();
    expect(adventureEndLogLine(view(objective, { scenario: { display: undefined } }))).toBe("Defeat — the enemy wins (4th space)");
  });
});

describe("trackDefeatRounds", () => {
  it("records first defeat only and keeps identity when nothing new", () => {
    const a = trackDefeatRounds({}, [{ type: "FIGHTER_DEFEATED", fighter: "x" }], 3);
    expect(a).toEqual({ x: 3 });
    expect(trackDefeatRounds(a, [{ type: "FIGHTER_DEFEATED", fighter: "x" }], 5)).toBe(a);
    expect(trackDefeatRounds(a, [{ type: "FIGHTER_DEFEATED", fighter: "y" }], null)).toBe(a);
  });
});
