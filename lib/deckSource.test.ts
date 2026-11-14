import axios from "axios";
import { mockDeck } from "@/_mocks_/deck";
import { newPool } from "@/components/DeckPool/PoolFns";
import type { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { deckSourceOf } from "./deckSource";
import { fetchDeckById } from "./evergreenDecks";

jest.mock("axios");
const get = axios.get as jest.Mock;

const deck = (over: Partial<DeckImportType>): DeckImportType =>
  ({ ...mockDeck, sourceUrl: undefined, ...over }) as DeckImportType;

describe("deckSourceOf", () => {
  const club = "https://www.the-unmatched.club/c/heroes/general-grievous.9861";
  const cards = "https://unmatched.cards/decks/pk1x";
  const labs = "https://www.unmatchedlabs.com/shared/0123456789abcdef01234567?character=char_ce316d14-8bc8-413d-9086-ad37b502d0fe";

  it("names the site from the recorded link's host", () => {
    expect(deckSourceOf({ sourceUrl: club })).toEqual({ deckSource: "unmatched-club", deckUrl: club });
    expect(deckSourceOf({ sourceUrl: cards })).toEqual({ deckSource: "unmatched-cards", deckUrl: cards });
    expect(deckSourceOf({ sourceUrl: labs })).toEqual({ deckSource: "labs", deckUrl: labs });
  });

  it("reports nothing without a link, or for one off the three sites", () => {
    expect(deckSourceOf({})).toBeUndefined();
    expect(deckSourceOf({ sourceUrl: "https://boardgamegeek.com/x" })).toBeUndefined();
    expect(deckSourceOf({ sourceUrl: "http://unmatched.cards/decks/pk1x" })).toBeUndefined();
    expect(deckSourceOf({ sourceUrl: "https://unmatched.cards.evil.example/decks/x" })).toBeUndefined();
    expect(deckSourceOf({ sourceUrl: "not a url" })).toBeUndefined();
    expect(deckSourceOf({ sourceUrl: cards + "/" + "a".repeat(512) })).toBeUndefined();
  });
});

describe("newPool", () => {
  it("carries deckSource + deckUrl together, or neither", () => {
    const withLink = newPool(deck({ sourceUrl: "https://unmatched.cards/decks/pk1x" }));
    expect(withLink.deckSource).toBe("unmatched-cards");
    expect(withLink.deckUrl).toBe("https://unmatched.cards/decks/pk1x");

    const bare = JSON.parse(JSON.stringify(newPool(deck({}))));
    expect(bare).not.toHaveProperty("deckSource");
    expect(bare).not.toHaveProperty("deckUrl");
  });
});

describe("fetchDeckById", () => {
  const fetched = (over: Partial<DeckImportType>) =>
    get.mockResolvedValueOnce({ data: deck(over) });

  beforeEach(() => get.mockReset());

  it("stamps an unmatched.cards deck with its page", async () => {
    fetched({ id: "pk1x", family_id: "pk1x" });
    const d = await fetchDeckById("pk1x");
    expect(deckSourceOf(d)).toEqual({
      deckSource: "unmatched-cards",
      deckUrl: "https://unmatched.cards/decks/pk1x",
    });
  });

  it("keeps a recorded the-unmatched.club link", async () => {
    const sourceUrl = "https://www.the-unmatched.club/c/heroes/boba-fett.7289";
    fetched({ id: "x1y2", family_id: "x1y2", sourceUrl });
    expect(deckSourceOf(await fetchDeckById("x1y2"))?.deckSource).toBe("unmatched-club");
  });

  it("never invents a page for an Unbrewed original", async () => {
    get.mockResolvedValueOnce({ data: deck({ id: "piper", family_id: "piper" }) });
    expect(deckSourceOf(await fetchDeckById("piper"))).toBeUndefined();
  });
});
