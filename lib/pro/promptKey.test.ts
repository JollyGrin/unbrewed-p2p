import { promptKeyOf } from "./promptKey";

describe("promptKeyOf (issue #1717)", () => {
  const sidekick = { promptId: "p0", player: "p1", kind: "CHOOSE_OPTION", description: "Choose your sidekick" } as const;

  it("tells the sidekick choice from the same seat's mulligan, though both are p0", () => {
    expect(promptKeyOf(sidekick)).not.toBe(promptKeyOf({ promptId: "p0", player: "p1", kind: "MULLIGAN" } as const));
  });

  it("tells one seat's sidekick choice from the next seat's", () => {
    expect(promptKeyOf(sidekick)).not.toBe(promptKeyOf({ ...sidekick, player: "p2" as const }));
  });

  it("is the same for the chooser's copy and everyone else's (options never enter it)", () => {
    expect(promptKeyOf({ ...sidekick, options: [{ id: "mouse", label: "Mouse" }] } as never)).toBe(
      promptKeyOf({ ...sidekick, options: [] } as never)
    );
  });

  it("is stable for one prompt across views", () => {
    expect(promptKeyOf({ ...sidekick })).toBe(promptKeyOf(sidekick));
  });
});
