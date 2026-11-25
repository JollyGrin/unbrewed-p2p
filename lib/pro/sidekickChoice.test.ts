import type { LegalOption, ViewFighter, ViewPrompt } from "./protocol";
import {
  isSidekickChoiceDescription,
  isSidekickChoicePrompt,
  otherSidekickLines,
  sidekickChoiceHeadline,
  sidekickOptionCaption,
  sidekickOptionData,
} from "./sidekickChoice";

// The options exactly as engine #1087's openSidekickChoicePrompt builds them for the
// chooser (Harry Dresden).
const MOUSE: LegalOption = { id: "mouse", label: "Mouse", data: { name: "Mouse", hp: 7, reach: "MELEE", quantity: 1 } };
const MURPHY: LegalOption = {
  id: "murphy",
  label: "Karrin Murphy",
  data: { name: "Karrin Murphy", hp: 5, reach: "RANGED", quantity: 1 },
};

const prompt = (over: Partial<ViewPrompt> = {}): ViewPrompt => ({
  promptId: "p0",
  player: "p1",
  kind: "CHOOSE_OPTION",
  options: [MOUSE, MURPHY],
  source: { hero: "p1" },
  description: "Choose your sidekick",
  ...over,
});

const fighter = (over: Partial<ViewFighter>): ViewFighter => ({
  id: "p1/hero",
  owner: "p1",
  kind: "HERO",
  name: "Harry Dresden",
  space: null,
  tailSpace: null,
  hp: 17,
  maxHp: 17,
  reach: "RANGED",
  size: "NORMAL",
  defeated: false,
  ...over,
});

const seat = (p: string) => (p === "p1" ? "You" : "Opponent");

describe("isSidekickChoicePrompt", () => {
  it("recognises the chooser's copy", () => {
    expect(isSidekickChoicePrompt(prompt())).toBe(true);
  });

  it("recognises the redacted copy every other seat gets (no options, same description)", () => {
    expect(isSidekickChoicePrompt(prompt({ player: "p2", options: [] }))).toBe(true);
  });

  it("recognises sidekick-shaped options even if the wording changes", () => {
    expect(isSidekickChoicePrompt(prompt({ description: undefined }))).toBe(true);
  });

  it("leaves every other prompt alone", () => {
    expect(isSidekickChoicePrompt(null)).toBe(false);
    expect(isSidekickChoicePrompt(prompt({ kind: "MULLIGAN", description: undefined }))).toBe(false);
    expect(
      isSidekickChoicePrompt(prompt({ description: "Choose one", options: [{ id: "a", label: "A" }, { id: "b", label: "B" }] }))
    ).toBe(false);
    expect(isSidekickChoicePrompt(prompt({ description: undefined, options: [] }))).toBe(false);
  });
});

describe("isSidekickChoiceDescription (engine PR #1091 wording)", () => {
  it.each(["Choose your sidekick", "choose your sidekick", "  Choose your sidekick  ", "Choose your sidekick.", "Choose your sidekick!", "Choose your sidekick:", "Choose  your\tsidekick"])(
    "accepts %j",
    (d) => {
      expect(isSidekickChoiceDescription(d)).toBe(true);
      expect(isSidekickChoicePrompt(prompt({ player: "p2", options: [], description: d }))).toBe(true);
    }
  );

  it.each([undefined, "", "Choose a sidekick to move", "Choose your sidekicks to move"])("rejects %j", (d) => {
    expect(isSidekickChoiceDescription(d)).toBe(false);
  });
});

describe("option copy", () => {
  it("reads the sidekick's stats off the option", () => {
    expect(sidekickOptionData(MOUSE)).toEqual({ name: "Mouse", hp: 7, reach: "MELEE", quantity: 1 });
    expect(sidekickOptionCaption(MOUSE)).toBe("7 HP · Melee");
    expect(sidekickOptionCaption(MURPHY)).toBe("5 HP · Ranged");
  });

  it("says a squad's size", () => {
    expect(sidekickOptionCaption({ id: "x", label: "Clones", data: { name: "Clones", hp: 1, reach: "RANGED", quantity: 3 } })).toBe(
      "1 HP each · ×3 · Ranged"
    );
  });

  it("has nothing to say for an option without stats", () => {
    expect(sidekickOptionCaption({ id: "x", label: "X" })).toBeNull();
    expect(sidekickOptionCaption({ id: "x", label: "X", data: { name: "X" } })).toBeNull();
  });
});

describe("sidekickChoiceHeadline", () => {
  it("gives the chooser the engine's own wording", () => {
    expect(sidekickChoiceHeadline(prompt(), "p1", seat)).toBe("Choose your sidekick");
  });

  it("tells everyone else who is choosing", () => {
    expect(sidekickChoiceHeadline(prompt({ player: "p2" }), "p1", seat)).toBe("Opponent is choosing a sidekick");
  });
});

describe("otherSidekickLines", () => {
  it("shows a later chooser the sidekick the earlier seat already picked", () => {
    // Mirror: p1 picked Mouse (figure exists, not yet placed); p2 is now choosing.
    const view = {
      fighters: [
        fighter({}),
        fighter({ id: "p1/sidekick-1", kind: "SIDEKICK", name: "Mouse", hp: 7, maxHp: 7, reach: "MELEE" }),
        fighter({ id: "p2/hero", owner: "p2" }),
      ],
    };
    expect(otherSidekickLines(view, "p2", (p) => (p === "p2" ? "You" : "Opponent"))).toEqual([
      "Opponent's sidekick: Mouse (7 HP · Melee)",
    ]);
  });

  it("speaks to the viewer about their own pick when someone else is choosing", () => {
    const view = { fighters: [fighter({ id: "p1/sidekick-1", kind: "SIDEKICK", name: "Mouse", hp: 7, maxHp: 7, reach: "MELEE" })] };
    expect(otherSidekickLines(view, "p2", seat)).toEqual(["Your sidekick: Mouse (7 HP · Melee)"]);
  });

  it("never lists the chooser's own sidekicks, and says nothing when nobody else has one", () => {
    const view = { fighters: [fighter({}), fighter({ id: "p2/hero", owner: "p2" })] };
    expect(otherSidekickLines(view, "p1", seat)).toEqual([]);
  });

  it("names a squad once with its size, from the printed dial", () => {
    const trooper = (n: number) =>
      fighter({ id: `p2/sidekick-${n}`, owner: "p2", kind: "SIDEKICK", name: "Clone Trooper", hp: n === 1 ? 0 : 1, maxHp: 1 });
    expect(otherSidekickLines({ fighters: [trooper(1), trooper(2), trooper(3)] }, "p1", seat)).toEqual([
      "Opponent's sidekick: Clone Trooper (1 HP each · ×3 · Ranged)",
    ]);
  });
});
