/**
 * Opening-hand mulligan prompt handling (issue #622 ↔ protocol v30, engine #395):
 * that the client recognises the window — including the opponent's redacted copy —
 * and classifies the two answers for presentation WITHOUT depending on their exact
 * option ids. The activity-feed half lives in gameLog.test.ts with the rest of the
 * event narration.
 */
import {
  MULLIGAN_PROMPT_KIND,
  decidedLabel,
  isMulliganPrompt,
  mulliganChoiceOf,
} from "./mulligan";
import { LegalOption, PlayerId, ViewPrompt } from "./protocol";

const prompt = (over: Partial<ViewPrompt> = {}): ViewPrompt =>
  ({
    promptId: "pr1",
    player: "p1" as PlayerId,
    kind: MULLIGAN_PROMPT_KIND,
    options: [],
    ...over,
  }) as unknown as ViewPrompt;

const option = (id: string, label: string): LegalOption => ({ id, label });

describe("isMulliganPrompt", () => {
  it("recognises the opening-hand window, including the opponent's redacted copy", () => {
    expect(isMulliganPrompt(prompt())).toBe(true);
    // The non-choosing seat gets the same prompt with its options stripped.
    expect(isMulliganPrompt(prompt({ player: "p2" as PlayerId, options: [] }))).toBe(true);
  });

  it("is false for every other prompt kind and for no prompt at all", () => {
    expect(isMulliganPrompt(prompt({ kind: "YES_NO" as ViewPrompt["kind"] }))).toBe(false);
    expect(isMulliganPrompt(prompt({ kind: "CHOOSE_SPACE" as ViewPrompt["kind"] }))).toBe(false);
    expect(isMulliganPrompt(null)).toBe(false);
    expect(isMulliganPrompt(undefined)).toBe(false);
  });
});

describe("mulliganChoiceOf — presentation only", () => {
  it("classifies by id or label, either case", () => {
    expect(mulliganChoiceOf(option("KEEP", "Keep"))).toBe("KEEP");
    expect(mulliganChoiceOf(option("MULLIGAN", "Mulligan"))).toBe("MULLIGAN");
    expect(mulliganChoiceOf(option("opt-1", "Keep this hand"))).toBe("KEEP");
    expect(mulliganChoiceOf(option("opt-2", "Redraw five cards"))).toBe("MULLIGAN");
  });

  it("returns null for an option it does not recognise (the button still renders)", () => {
    expect(mulliganChoiceOf(option("opt-3", "Something else"))).toBeNull();
  });
});

describe("decidedLabel", () => {
  it("reports only what YOU chose", () => {
    expect(decidedLabel("KEEP")).toBe("You kept your opening hand");
    expect(decidedLabel("MULLIGAN")).toBe("You mulliganed your opening hand");
    expect(decidedLabel(null)).toBe("You have decided");
  });
});
