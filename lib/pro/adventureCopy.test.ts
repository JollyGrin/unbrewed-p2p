import { threatSourceWords } from "./adventureCopy";
import type { ScenarioDisplay } from "./protocol";

describe("threatSourceWords", () => {
  it("maps bySource keys to plain words", () => {
    expect(threatSourceWords("roundEnd")).toBe("the round's end");
    expect(threatSourceWords("noTarget")).toBe("an enemy with no target");
    const display = { enemyNoun: { singular: "dinosaur", plural: "dinosaurs" } } as ScenarioDisplay;
    expect(threatSourceWords("noTarget", display)).toBe("a dinosaur with no target");
    expect(threatSourceWords("effect")).toBe("a card effect");
    expect(threatSourceWords("someNewKey")).toBe("some new key");
  });
});
