/**
 * #1033: a re-add asks only when the player has changes to lose. Source data
 * moving on (revision, dates, re-rendered images, key order) is not a change.
 */
import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { deckEditsLost } from "./deckEdits";

const card = (title: string, url: string, extra: object = {}) => ({
  title,
  quantity: 1,
  imageUrl: url,
  ...extra,
});

const base = (): DeckImportType =>
  ({
    id: "labs-char_1",
    name: "Lucy",
    version_id: "rev-1",
    updated_on: "2026-09-01",
    likes: 3,
    deck_data: {
      appearance: { cardbackUrl: "https://src/back.png" },
      hero: { name: "Lucy", hp: 14, move: 2, isRanged: false, specialAbility: "Run" },
      sidekick: { name: "Piper", hp: 6, quantity: 1, isRanged: true, quote: "" },
      cards: [
        card("Lucy", "https://src/lucy-1.png", { isCharacterCard: true }),
        card("Rules", "https://src/rules-1.png"),
        card("Sprint", "https://src/sprint-1.png"),
      ],
    },
    savedTokens: [{ imageUrl: "https://src/lucy-1.png", label: "Lucy" }],
  }) as unknown as DeckImportType;

/** The same deck, as the source publishes its next revision. */
const newerSource = (): DeckImportType => {
  const deck = base();
  const cards = deck.deck_data.cards.map((c: any) => ({
    ...c,
    imageUrl: c.imageUrl.replace("-1.png", "-2.png"),
  }));
  return {
    ...deck,
    version_id: "rev-2",
    updated_on: "2026-09-28",
    likes: 9,
    deck_data: { ...deck.deck_data, cards },
    savedTokens: [{ imageUrl: "https://src/lucy-2.png", label: "Lucy" }],
  } as unknown as DeckImportType;
};

const withData = (deck: DeckImportType, data: object): DeckImportType =>
  ({ ...deck, deck_data: { ...deck.deck_data, ...data } }) as DeckImportType;

describe("deckEditsLost", () => {
  it("identical re-add: nothing to lose", () => {
    expect(deckEditsLost(base(), base())).toEqual([]);
  });

  it("unedited deck, newer source revision with re-rendered images: nothing to lose", () => {
    expect(deckEditsLost(base(), newerSource())).toEqual([]);
  });

  it("key order is not a change", () => {
    const reordered = Object.fromEntries(Object.entries(base()).reverse());
    expect(deckEditsLost(base(), reordered as unknown as DeckImportType)).toEqual([]);
  });

  it("a saved copy with no loadout loses nothing, whatever the import seeds", () => {
    const { savedTokens: _, ...bare } = base();
    expect(deckEditsLost(bare as DeckImportType, newerSource())).toEqual([]);
  });

  it("a token the player added, even on a newer revision", () => {
    const saved = {
      ...base(),
      savedTokens: [...base().savedTokens!, { imageUrl: "https://me/dog.png" }],
    } as DeckImportType;
    expect(deckEditsLost(saved, newerSource())).toEqual(["saved tokens"]);
  });

  it("a seeded token the player removed", () => {
    expect(deckEditsLost({ ...base(), savedTokens: [] }, base())).toEqual(["saved tokens"]);
  });

  it("the token colour", () => {
    expect(deckEditsLost({ ...base(), savedTokenColor: "#ff0000" }, base())).toEqual([
      "token colour",
    ]);
  });

  it("a card flagged or unflagged as a hero / rule card", () => {
    const saved = withData(base(), {
      cards: base().deck_data.cards.map((c: any) =>
        c.title === "Rules" ? { ...c, isCharacterCard: true } : c,
      ),
    });
    expect(deckEditsLost(saved, newerSource())).toEqual(["hero and rule cards"]);
  });

  it("hero, sidekick and card back edits on the same source revision", () => {
    const saved = withData(base(), {
      hero: { ...base().deck_data.hero, hp: 16 },
      sidekick: { ...base().deck_data.sidekick, quantity: 2 },
      appearance: { cardbackUrl: "https://me/back.png" },
    });
    expect(deckEditsLost(saved, base())).toEqual([
      "hero stats",
      "sidekick stats",
      "card back",
    ]);
  });

  it("hero stats and card back belong to the source once it has a new revision", () => {
    const saved = withData(base(), {
      hero: { ...base().deck_data.hero, hp: 16 },
      appearance: { cardbackUrl: "https://me/back.png" },
    });
    expect(deckEditsLost(saved, newerSource())).toEqual([]);
  });
});
