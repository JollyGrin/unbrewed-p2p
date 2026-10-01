import { threatSourceWords } from "./adventureCopy";

describe("threatSourceWords", () => {
  it("maps bySource keys to plain words", () => {
    expect(threatSourceWords("roundEnd")).toBe("the round's end");
    expect(threatSourceWords("noTarget")).toBe("a dinosaur with no target");
    expect(threatSourceWords("effect")).toBe("a card effect");
    expect(threatSourceWords("someNewKey")).toBe("some new key");
  });
});
