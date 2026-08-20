/**
 * Opening-hand mulligan wiring (issue #622 ↔ engine #395). The engine names the
 * prompt kind and the two window-close events; these tests pin the client half:
 * that it recognises the window, classifies the two answers for presentation
 * WITHOUT depending on exact ids, and narrates the close for both seats.
 */
import {
  HAND_KEPT_EVENT,
  MULLIGAN_PROMPT_KIND,
  MULLIGAN_TAKEN_EVENT,
  decidedLabel,
  isMulliganPrompt,
  mulliganChoiceOf,
  mulliganLogLines,
} from "./mulligan";
import { GameEvent, LegalOption, PlayerId, ViewPrompt } from "./protocol";

const prompt = (over: Partial<ViewPrompt> = {}): ViewPrompt =>
  ({
    promptId: "pr1",
    player: "p1" as PlayerId,
    kind: MULLIGAN_PROMPT_KIND,
    options: [],
    ...over,
  }) as unknown as ViewPrompt;

const option = (id: string, label: string): LegalOption => ({ id, label });

const seat = (p: PlayerId) => (p === "p1" ? "You" : "Opponent");

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

describe("mulliganLogLines — the window closing", () => {
  const events = (...es: unknown[]) => es as unknown as GameEvent[];

  it("names each seat's choice for both seats once the window closes", () => {
    const lines = mulliganLogLines(
      events(
        { type: MULLIGAN_TAKEN_EVENT, player: "p1" },
        { type: HAND_KEPT_EVENT, player: "p2" }
      ),
      { you: "p1" as PlayerId, seat }
    );
    expect(lines).toEqual([
      { text: "You mulliganed your opening hand", who: "you" },
      { text: "Opponent kept their opening hand", who: "opp" },
    ]);
  });

  it("reads the same window from the other seat", () => {
    const lines = mulliganLogLines(
      events(
        { type: MULLIGAN_TAKEN_EVENT, player: "p1" },
        { type: HAND_KEPT_EVENT, player: "p2" }
      ),
      { you: "p2" as PlayerId, seat: (p) => (p === "p2" ? "You" : "Opponent") }
    );
    expect(lines).toEqual([
      { text: "Opponent mulliganed their opening hand", who: "opp" },
      { text: "You kept your opening hand", who: "you" },
    ]);
  });

  it("ignores unrelated events and malformed ones", () => {
    expect(
      mulliganLogLines(
        events(
          { type: "CARD_DRAWN", player: "p1", card: "c1" },
          { type: MULLIGAN_TAKEN_EVENT },
          { type: HAND_KEPT_EVENT, player: 7 }
        ),
        { you: "p1" as PlayerId, seat }
      )
    ).toEqual([]);
  });

  it("emits nothing on a server that never opens the window", () => {
    expect(mulliganLogLines([], { you: "p1" as PlayerId, seat })).toEqual([]);
  });
});

describe("decidedLabel", () => {
  it("reports only what YOU chose", () => {
    expect(decidedLabel("KEEP")).toBe("You kept your opening hand");
    expect(decidedLabel("MULLIGAN")).toBe("You mulliganed your opening hand");
    expect(decidedLabel(null)).toBe("You have decided");
  });
});
