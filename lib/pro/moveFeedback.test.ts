import {
  isMovePrompt,
  moveBudgetLine,
  unofferableMoveFeedback,
} from "./moveFeedback";
import type { ViewPrompt } from "./protocol";

const prompt = (over: Partial<ViewPrompt> = {}): ViewPrompt => ({
  promptId: "p1",
  player: "p1",
  kind: "CHOOSE_SPACE",
  options: [],
  ...over,
});

describe("isMovePrompt", () => {
  it("true for a LARGE mover's pose prompt regardless of description", () => {
    expect(isMovePrompt(prompt({ description: undefined }), true)).toBe(true);
  });

  it("true for a CHOOSE_SPACE whose description names the move verb", () => {
    expect(isMovePrompt(prompt({ description: "Move up to 2 spaces" }), false)).toBe(true);
  });

  it("false for a placement / token CHOOSE_SPACE with no move verb", () => {
    expect(isMovePrompt(prompt({ description: "Place a totem" }), false)).toBe(false);
    expect(isMovePrompt(prompt({ description: undefined }), false)).toBe(false);
  });

  it("false for non-CHOOSE_SPACE kinds and null", () => {
    expect(isMovePrompt(prompt({ kind: "CHOOSE_TARGET", description: "Move it" }), false)).toBe(false);
    expect(isMovePrompt(null, true)).toBe(false);
  });
});

describe("moveBudgetLine", () => {
  it("surfaces the server's budget summary verbatim", () => {
    expect(moveBudgetLine(prompt({ description: "Move up to 2 spaces" }), false)).toBe(
      "Move up to 2 spaces",
    );
  });

  it("falls back to a move-shaped line when a pose prompt has no description", () => {
    expect(moveBudgetLine(prompt({ description: undefined }), true)).toBe("Choose where to move.");
    expect(moveBudgetLine(prompt({ description: "   " }), true)).toBe("Choose where to move.");
  });

  it("returns null for non-move prompts", () => {
    expect(moveBudgetLine(prompt({ description: "Place a totem" }), false)).toBeNull();
    expect(moveBudgetLine(null, false)).toBeNull();
  });
});

describe("unofferableMoveFeedback", () => {
  const base = {
    prompt: prompt({ description: "Move up to 2 spaces" }),
    offeredSpaces: new Set(["s1", "s2"]),
    largeMover: false,
  };

  it("stays silent when the space is actually offered", () => {
    expect(unofferableMoveFeedback({ ...base, space: "s1" })).toBeNull();
  });

  it("gives generic copy for an unoffered space", () => {
    expect(unofferableMoveFeedback({ ...base, space: "s9" })).toBe("Not reachable with this move.");
  });

  it("explains the LARGE-into-region case when the data is at hand (issue #326)", () => {
    expect(
      unofferableMoveFeedback({
        prompt: prompt({ description: "Move up to 2 spaces" }),
        offeredSpaces: new Set(["s1"]),
        largeMover: true,
        space: "hut1",
        spaceRegion: "hut",
      }),
    ).toBe("A large fighter needs more movement to fit inside.");
  });

  it("falls back to generic copy for a LARGE mover tapping a main-board space", () => {
    expect(
      unofferableMoveFeedback({
        prompt: prompt({ description: "Move up to 2 spaces" }),
        offeredSpaces: new Set(["s1"]),
        largeMover: true,
        space: "s9",
        spaceRegion: null,
      }),
    ).toBe("Not reachable with this move.");
  });

  it("stays silent for non-move (placement/token) prompts — no false 'not reachable'", () => {
    expect(
      unofferableMoveFeedback({
        prompt: prompt({ description: "Place a totem" }),
        offeredSpaces: new Set(["s1"]),
        largeMover: false,
        space: "s9",
      }),
    ).toBeNull();
  });
});
