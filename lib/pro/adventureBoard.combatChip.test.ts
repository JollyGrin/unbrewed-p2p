import { enemyCombatModel } from "./adventureBoard";
import type { PlayerView } from "./protocol";

const view = (instance: string): PlayerView =>
  ({
    fighters: [{ id: "e1", name: "Carnotaurus", enemy: { role: "VILLAIN" } }],
    catalog: {
      "carnotaurus/back-into-the-brush": { title: "Back into the Brush", value: 3, defense: 5 },
    },
    combat: {
      attacker: "e1",
      target: "h1",
      attackerCard: { instance, effectiveValue: 4, boosts: [] },
      defenderCard: null,
    },
  }) as unknown as PlayerView;

describe("enemyCombatModel card id resolution", () => {
  it("resolves enemy instance ids (#<seat>.<fighter>.<n>) to catalog title/value", () => {
    const m = enemyCombatModel(view("carnotaurus/back-into-the-brush#p3.enemy-3.2"));
    expect(m?.[0].title).toBe("Back into the Brush");
    expect(m?.[0].printed).toBe(3);
  });
  it("still resolves plain numeric suffixes", () => {
    expect(enemyCombatModel(view("carnotaurus/back-into-the-brush#12"))?.[0].title).toBe("Back into the Brush");
  });
  it("falls back to the raw id when the catalog lacks it", () => {
    expect(enemyCombatModel(view("x/y#p1.a.1"))?.[0].title).toBe("x/y#p1.a.1");
  });
});
