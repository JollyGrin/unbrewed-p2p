import { LabsImportError } from "@/lib/labs/errors";
import {
  deckAddedProps,
  failureReason,
  gameModeOfPath,
  trackDeckSelected,
} from "./deckAnalytics";

const mockTrack = jest.fn();
jest.mock("./analytics", () => ({
  ...jest.requireActual("./analytics"),
  track: (...a: unknown[]) => mockTrack(...a),
}));

const deck = (over: Record<string, unknown> = {}) =>
  ({
    id: "d1",
    name: "Grandma's Secret Deck",
    deck_data: { hero: { name: "Grandma's Hero" }, cards: [{ quantity: 2 }, { quantity: 1 }] },
    ...over,
  }) as any;

beforeEach(() => mockTrack.mockClear());

describe("deckAddedProps", () => {
  it("carries the catalog hero name for a catalog source", () => {
    expect(deckAddedProps(deck(), "code")).toEqual({
      source: "code",
      deck_id: "d1",
      hero_name: "Grandma's Hero",
      card_count: 3,
    });
  });

  it.each(["image", "the-unmatched.club"] as const)(
    "carries no player-typed text for a custom-named %s deck",
    (source) => {
      const props = deckAddedProps(deck(), source);
      expect(props).toEqual({ source, deck_id: "d1", card_count: 3 });
      expect(JSON.stringify(props)).not.toMatch(/Grandma/);
    },
  );

  it("never carries the deck name", () => {
    expect(JSON.stringify(deckAddedProps(deck(), "popular"))).not.toContain("Secret Deck");
  });
});

describe("failureReason", () => {
  it("classifies without message text", () => {
    expect(failureReason(new LabsImportError("not-found", "long message"))).toBe("not-found");
    expect(failureReason(new SyntaxError("Unexpected token x"))).toBe("parse_error");
    expect(failureReason({ response: { status: 404 }, message: "Request failed" })).toBe(404);
    expect(failureReason(new Error("socket hang up"))).toBe("network");
  });
});

describe("trackDeckSelected", () => {
  it("reports the stored add source for a bag deck", () => {
    trackDeckSelected("sandbox", "d1", [deck({ addSource: "starter" })]);
    expect(mockTrack).toHaveBeenCalledWith("deck_selected_for_game", {
      mode: "sandbox",
      deck_id: "d1",
      source: "starter",
    });
  });

  it("reports pro-hero for a Pro roster deck that isn't in the bag", () => {
    trackDeckSelected("sandbox-table", "p1", [], [deck({ id: "p1" })]);
    expect(mockTrack).toHaveBeenCalledWith("deck_selected_for_game", {
      mode: "sandbox-table",
      deck_id: "p1",
      source: "pro-hero",
    });
  });

  it("sends nothing for an unknown id", () => {
    trackDeckSelected("sandbox", "nope", [deck()]);
    expect(mockTrack).not.toHaveBeenCalled();
  });
});

it("maps game routes to the taxonomy mode", () => {
  expect(gameModeOfPath("/irl")).toBe("irl");
  expect(gameModeOfPath("/offline")).toBe("irl");
  expect(gameModeOfPath("/table")).toBe("sandbox-table");
  expect(gameModeOfPath("/game")).toBe("sandbox");
});
