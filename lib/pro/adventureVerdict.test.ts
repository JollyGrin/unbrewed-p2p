import { adventureEndLogLine, adventureVerdictModel } from "./adventureVerdict";
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
    const releases = [
      { round: 3, fighter: "e1/trex", enemyId: "trex", spaceLabel: "2", defeatedRound: 6 },
      { round: 5, fighter: "e1/trex", enemyId: "trex", defeatedRound: 6 },
    ];
    const m = adventureVerdictModel(view(objective, { scenario: { releases } }))!;
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

  it("reads the engine's releases[].defeatedRound, so a reload still says when the enemy fell (#1458)", () => {
    // no watched rounds at all (a reconnect into the finished room): the stamp carries the tile + the victory line
    const stamped = { scenario: { releases: [{ round: 3, fighter: "e1/trex", enemyId: "trex", spaceLabel: "2", defeatedRound: 6 }] } };
    expect(adventureVerdictModel(view(objective, stamped))!.releases.map((t) => t.defeatedRound)).toEqual([6, null]);
    const win = adventureVerdictModel(view({ verdict: "VICTORY", cause: { kind: "VICTORY_CONDITION" }, round: 8 }, stamped))!;
    expect(win.lines).toEqual(["Indominus Rex fell.", "The last loose enemy, T. Rex, fell in round 6."]);
    expect(adventureVerdictModel(view(objective))!.releases[0].defeatedRound).toBeNull();
  });

  it("YOUR TEAM names the heroes who fell, with ViewFighter.defeatedRound when the view has it (#1182, #1472)", () => {
    expect(adventureVerdictModel(view(objective))!.facts[1]).toEqual({ label: "Your team", text: "Heroes down: none." });
    const down = view(objective);
    Object.assign(down.fighters[0], { defeated: true, defeatedRound: 6 });
    expect(adventureVerdictModel(down)!.facts[1].text).toBe("Heroes down: Kong (R6).");
    // field absent (outside a scenario game's ledger): the name, no round
    delete (down.fighters[0] as { defeatedRound?: number }).defeatedRound;
    expect(adventureVerdictModel(down)!.facts[1].text).toBe("Heroes down: Kong.");
  });

  it("DEFEAT by WIPE", () => {
    const m = adventureVerdictModel(view({ verdict: "DEFEAT", cause: { kind: "WIPE" }, round: 4 }))!;
    expect(m.headline).toBe("THE HEROES FELL");
    expect(m.lines).toEqual(["Every hero and sidekick is down.", "Indominus Rex was left at 6 of 20 health."]);
    expect(m.releases.some((t) => t.final)).toBe(false);
  });

  it("VICTORY says when the villain (ViewFighter.defeatedRound, #1472) and the last released enemy fell", () => {
    const win: ScenarioResult = { verdict: "VICTORY", cause: { kind: "VICTORY_CONDITION" }, round: 8 };
    const v = view(win, { scenario: { releases: [{ round: 3, fighter: "e1/trex", enemyId: "trex", defeatedRound: 8 }] } });
    Object.assign(v.fighters[1], { defeated: true, defeatedRound: 7 });
    const m = adventureVerdictModel(v)!;
    expect(m.headline).toBe("THE ISLAND IS SAFE");
    expect(m.lines).toEqual(["Indominus Rex fell in round 7.", "The last loose enemy, T. Rex, fell in round 8."]);
    // field absent: no round, no crash
    expect(adventureVerdictModel(view(win))!.lines).toEqual(["Indominus Rex fell."]);
  });

  describe("the villain fell, the team still lost (#1495)", () => {
    const felled = (result: ScenarioResult, extra: Record<string, unknown> = { defeatedRound: 6 }, over: Record<string, unknown> = {}) => {
      const v = view(result, over);
      Object.assign(v.fighters[1], { hp: 0, defeated: true, ...extra });
      return adventureVerdictModel(v)!;
    };

    it("OBJECTIVE: names the round she fell and the space that broke, never credits her or prints her hp", () => {
      expect(felled(objective).lines).toEqual(["Indominus Rex fell in round 6, but the fourth pen broke open."]);
      // no defeatedRound on the view, no finalSlot on the wire
      expect(felled({ ...objective, finalSlot: undefined }, {}).lines).toEqual(["Indominus Rex fell, but the last pen broke open."]);
      expect(felled(objective).releases.at(-1)).toMatchObject({ final: true, ordinal: "fourth" });
    });

    it("WIPE: no 'was left at … health' line", () => {
      expect(felled({ verdict: "DEFEAT", cause: { kind: "WIPE" }, round: 9 }).lines).toEqual(["Every hero and sidekick is down."]);
    });

    it("DEFEAT_CONDITION: no 'was left at … health' line", () => {
      const briefing = { scenario: { briefing: { tagline: "", objective: "", win: "", lose: "The vault was emptied." } } };
      expect(felled({ verdict: "DEFEAT", cause: { kind: "DEFEAT_CONDITION" }, round: 9 }, undefined, briefing).lines).toEqual([
        "The vault was emptied.",
      ]);
    });
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
    expect(m.lines).toEqual(["The vault was emptied.", "Indominus Rex was left at 6 of 20 health."]);
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
