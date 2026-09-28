import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { initPool } from "@/lib/sandbox/initGame";
import { refreshedDeck } from "@/lib/deckLink";
import { poolIsFrom, refreshPool, refreshTokens } from "@/lib/deckRefresh";

const card = (title: string, url: string, extra = {}) =>
  ({
    title,
    quantity: 2,
    type: "attack",
    value: 3,
    boost: 1,
    characterName: "Marouine",
    basicText: "",
    immediateText: "",
    duringText: "",
    afterText: "",
    imageUrl: url,
    cardImage: { url },
    ...extra,
  }) as any;

const deck = (version: string, suffix: string): DeckImportType =>
  ({
    id: "labs-char_x",
    family_id: "labs-char_x",
    version_id: version,
    name: "Marouine",
    note: "",
    user: "TheNullProfessor",
    deck_data: {
      name: "Marouine",
      appearance: { cardbackUrl: "https://labs/back.png" },
      hero: { name: "Marouine", hp: 15, move: 2, isRanged: false, specialAbility: "" },
      sidekick: { name: "", hp: null, isRanged: false, quantity: 0, quote: "" },
      cards: [
        card("Point Blank", `https://labs/point-blank-${suffix}.png`),
        card("Flinch", `https://labs/flinch-${suffix}.png`),
        card("Marouine", `https://labs/hero-${suffix}.png`, { isCharacterCard: true, quantity: 1 }),
      ],
    },
  }) as any;

const A = deck("4", "a");
const B = deck("5", "b");

describe("refreshedDeck", () => {
  it("is null for the same revision with the same renders", () => {
    expect(refreshedDeck(A, deck("4", "a"))).toBeNull();
  });

  it("replaces a same-revision deck whose renders changed", () => {
    expect(refreshedDeck(A, deck("4", "b"))?.deck_data.cards[0].cardImage?.url).toBe(
      "https://labs/point-blank-b.png",
    );
  });

  it("keeps the player's loadout and colour, pointing the hero card at its new render", () => {
    const mine = { imageUrl: "https://me/marker.png", size: 40 };
    const saved = {
      ...A,
      savedTokens: [{ imageUrl: "https://labs/hero-a.png", size: 130 }, mine],
      savedTokenColor: "#abcdef",
    };
    const fetched = { ...B, savedTokens: [{ imageUrl: "https://labs/hero-b.png", size: 130 }] };
    const next = refreshedDeck(saved, fetched)!;
    expect(next.version_id).toBe("5");
    expect(next.savedTokens).toEqual([{ imageUrl: "https://labs/hero-b.png", size: 130 }, mine]);
    expect(next.savedTokenColor).toBe("#abcdef");
  });

  it("keeps a loadout the player emptied empty", () => {
    const fetched = { ...B, savedTokens: [{ imageUrl: "https://labs/hero-b.png", size: 130 }] };
    expect(refreshedDeck({ ...A, savedTokens: [] }, fetched)!.savedTokens).toEqual([]);
  });

  it("takes the fetched seed when the saved copy never had a loadout", () => {
    const seed = [{ imageUrl: "https://labs/hero-b.png", size: 130 }];
    expect(refreshedDeck(A, { ...B, savedTokens: seed })!.savedTokens).toEqual(seed);
  });
});

describe("refreshPool", () => {
  it("re-faces every card where it is, without dealing or reordering", () => {
    const pool = initPool(A);
    pool.discard.push({ ...pool.deck!.pop()! });
    const order = pool.deck!.map((c) => c.title);
    const next = refreshPool(pool, { from: A, to: B });

    expect(next.deck!.map((c) => c.title)).toEqual(order);
    expect(next.hand).toHaveLength(pool.hand.length);
    expect(next.discard).toHaveLength(1);
    for (const c of [...next.deck!, ...next.hand, ...next.discard]) {
      expect(c.imageUrl).toMatch(/-b\.png$/);
    }
    expect(poolIsFrom(pool, A)).toBe(true);
  });
});

describe("refreshTokens", () => {
  it("keeps every token's id and spot, swapping only faces", () => {
    const tokens = [
      { id: "t1", x: 10, y: 20, imageUrl: "https://labs/hero-a.png", size: 130 },
      { id: "t2", x: 30, y: 40, card: card("Flinch", "https://labs/flinch-a.png") },
      { id: "t3", x: 50, y: 60 },
    ];
    expect(refreshTokens(tokens, { from: A, to: B })).toEqual([
      { id: "t1", x: 10, y: 20, imageUrl: "https://labs/hero-b.png", size: 130 },
      {
        id: "t2",
        x: 30,
        y: 40,
        card: expect.objectContaining({ title: "Flinch", imageUrl: "https://labs/flinch-b.png" }),
      },
      { id: "t3", x: 50, y: 60 },
    ]);
  });
});
