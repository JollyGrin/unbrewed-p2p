import { stateHash } from "./stateHash";
import { PlayerView } from "./protocol";

const view = (over: Partial<PlayerView> = {}): PlayerView =>
  ({
    you: "p1",
    phase: "PLAY",
    turnNumber: 3,
    activePlayer: "p1",
    actionsRemaining: 2,
    turnPhase: "ACTION_SELECT",
    fighters: [
      { id: "p1/hero", hp: 10, space: "s1", defeated: false },
      { id: "p2/hero", hp: 8, space: "s5", defeated: false },
    ],
    ...over,
  } as unknown as PlayerView);

describe("stateHash", () => {
  it("is deterministic for the same view", () => {
    expect(stateHash(view())).toBe(stateHash(view()));
  });

  it("changes when a meaningful field changes", () => {
    const base = stateHash(view());
    expect(stateHash(view({ turnNumber: 4 }))).not.toBe(base);
    expect(
      stateHash(
        view({
          fighters: [
            { id: "p1/hero", hp: 7, space: "s1", defeated: false },
            { id: "p2/hero", hp: 8, space: "s5", defeated: false },
          ] as unknown as PlayerView["fighters"],
        })
      )
    ).not.toBe(base);
  });

  it("never throws on a malformed / null view (the exact case that crashed the render)", () => {
    expect(stateHash(null)).toBe("no-state");
    expect(stateHash(undefined)).toBe("no-state");
    // fighters missing entirely — must degrade, not throw
    expect(() => stateHash({ turnNumber: 1 } as unknown as PlayerView)).not.toThrow();
  });
});
