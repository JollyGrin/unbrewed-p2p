/**
 * The cosmetics seam of the cosmetic-rewards epic (#610).
 *
 * Half of this file pins the seam's BASE behaviour: with nothing equipped,
 * every card of a real image deck AND a real generated deck comes out of the
 * seam byte-for-byte identical to the direct `card.cardImage` read the
 * renderers used to do inline. The metal-rim ladder was added on top of that
 * baseline, and it must stay true — a player with no cosmetics sees exactly the
 * pre-epic render.
 *
 * The other half pins what the treatment layer adds: a MIXED registry (some
 * cards upgraded, at different tiers, some not) reaching the seam per card, and
 * `resolveCard` stamping it onto the resolved card without disturbing the
 * object identity memoized renderers key on.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import axios from "axios";
import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { cardAppearance, withRimTier } from "./cardAppearance";
import { COSMETICS_DEBUG_KEY, __resetCosmeticsForTest } from "./cosmetics";
import { CardDefId, CardMeta } from "./protocol";
import { norm, useProCardArt } from "./useProCardArt";

const DECKS_DIR = join(__dirname, "..", "..", "public", "evergreen-decks");
const readDeck = (deckId: string): DeckImportType =>
  JSON.parse(readFileSync(join(DECKS_DIR, `${deckId}.json`), "utf8"));

/** Kenshiro — every card carries a full-bleed `cardImage`. */
const IMAGE_HERO = "kenshiro";
/** King Taranis — no `cardImage` anywhere; art rides `imageUrl` through the
 * generated template, so the seam must answer null for all 30-odd cards. */
const GENERATED_HERO = "king-taranis";

describe("cardAppearance (the seam's pure core)", () => {
  it.each([
    ["image deck", IMAGE_HERO, "6rDz"],
    ["generated deck", GENERATED_HERO, "taranis"],
  ])(
    "matches the direct cardImage read for every card of a %s",
    (_kind, _hero, deckId) => {
      const cards = readDeck(deckId).deck_data.cards;
      expect(cards.length).toBeGreaterThan(0);
      for (const card of cards) {
        // ...what Card.tsx / cardFace.tsx used to do inline:
        expect(cardAppearance(card).cardImage).toEqual(card.cardImage ?? null);
      }
    },
  );

  it("keeps an image deck's art and a generated deck's absence of it distinguishable", () => {
    const image = readDeck("6rDz").deck_data.cards;
    const generated = readDeck("taranis").deck_data.cards;
    expect(image.every((c) => !!cardAppearance(c).cardImage?.url)).toBe(true);
    expect(generated.every((c) => cardAppearance(c).cardImage === null)).toBe(
      true,
    );
  });

  it("passes a sprite-sheet cell through untouched", () => {
    const sheet = {
      url: "https://example.com/sheet.webp",
      cols: 10,
      rows: 7,
      index: 23,
    };
    expect(
      cardAppearance({ title: "Feint", cardImage: sheet } as never).cardImage,
    ).toEqual(sheet);
  });

  it("answers null for a card that never resolved", () => {
    expect(cardAppearance(null).cardImage).toBeNull();
    expect(cardAppearance(undefined).cardImage).toBeNull();
  });
});

// --- the hook-level (heroId, title) entry point -----------------------------

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

const catalogOf = (
  heroId: string,
  deckId: string,
): Record<CardDefId, CardMeta> =>
  Object.fromEntries(
    readDeck(deckId).deck_data.cards.map((card, i) => [
      `${heroId}/c${i}`,
      {
        title: card.title,
        type: "attack",
        value: null,
        boost: null,
      } as CardMeta,
    ]),
  );

const renderArt = async (heroes: [string, string][]) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const catalog = heroes.reduce(
    (acc, [heroId, deckId]) => ({ ...acc, ...catalogOf(heroId, deckId) }),
    {} as Record<CardDefId, CardMeta>,
  );
  const { result } = renderHook(
    () =>
      useProCardArt(
        heroes.map(([h]) => h),
        catalog,
      ),
    {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  return result;
};

describe("resolveCardAppearance", () => {
  beforeEach(() => {
    mockedAxios.get.mockImplementation(async (url: string) => {
      const deckId = url.replace("/evergreen-decks/", "").replace(".json", "");
      return { data: readDeck(deckId) } as never;
    });
  });
  afterEach(() => jest.resetAllMocks());

  it.each([
    ["image", IMAGE_HERO, "6rDz"],
    ["generated", GENERATED_HERO, "taranis"],
  ])(
    "returns the snapshot's cardImage for every title of a %s deck",
    async (_k, heroId, deckId) => {
      const result = await renderArt([[heroId, deckId]]);
      const cards = readDeck(deckId).deck_data.cards;
      for (const card of cards) {
        // The pre-seam resolution: index the frozen snapshot by norm(title) and
        // take its cardImage.
        const direct =
          cards.find((c) => norm(c.title) === norm(card.title))?.cardImage ??
          null;
        expect(
          result.current.resolveCardAppearance(heroId, card.title),
        ).toEqual({
          // Nothing equipped in this fixture — the seam's answer is still
          // exactly the pre-cosmetics resolution.
          cardImage: direct,
          rimTier: null,
        });
      }
    },
  );

  it("is per card, not per deck: two heroes loaded at once never cross over", async () => {
    const result = await renderArt([
      [IMAGE_HERO, "6rDz"],
      [GENERATED_HERO, "taranis"],
    ]);
    const imageTitle = readDeck("6rDz").deck_data.cards[0].title;
    expect(
      result.current.resolveCardAppearance(IMAGE_HERO, imageTitle).cardImage,
    ).not.toBeNull();
    // Same title, other hero — that hero simply doesn't have the card.
    expect(
      result.current.resolveCardAppearance(GENERATED_HERO, imageTitle)
        .cardImage,
    ).toBeNull();
  });

  it("normalizes the title the same way the art index does", async () => {
    const result = await renderArt([[IMAGE_HERO, "6rDz"]]);
    const title = readDeck("6rDz").deck_data.cards[0].title;
    expect(
      result.current.resolveCardAppearance(
        IMAGE_HERO,
        `  ${title.toUpperCase()} `,
      ),
    ).toEqual(result.current.resolveCardAppearance(IMAGE_HERO, title));
  });

  it("answers null — never throws — for an unknown hero or title", async () => {
    const result = await renderArt([[IMAGE_HERO, "6rDz"]]);
    expect(
      result.current.resolveCardAppearance("nobody", "Feint").cardImage,
    ).toBeNull();
    expect(
      result.current.resolveCardAppearance(IMAGE_HERO, "No Such Card")
        .cardImage,
    ).toBeNull();
  });

  it("leaves resolveCard's object identity intact (memoized renderers key on it)", async () => {
    const result = await renderArt([[IMAGE_HERO, "6rDz"]]);
    const first = result.current.resolveCard(`${IMAGE_HERO}/c0#1`);
    const second = result.current.resolveCard(`${IMAGE_HERO}/c0#2`);
    expect(first).not.toBeNull();
    expect(first).toBe(second);
    expect(first!.cardImage).toEqual(
      result.current.resolveCardAppearance(IMAGE_HERO, first!.title).cardImage,
    );
  });
});

// --- the treatment layer ----------------------------------------------------

/** Mixed on purpose: three of Kenshiro's cards upgraded at three different
 * tiers, the rest left at base art. A uniform registry would pass even if the
 * per-card lookup were broken. */
const equip = (registry: unknown) => {
  window.localStorage.setItem(COSMETICS_DEBUG_KEY, JSON.stringify(registry));
  // The shared registry is memoized per page load (#613) — drop the cache so a
  // test can equip mid-suite.
  __resetCosmeticsForTest();
};

const equipMixed = (cards: DeckImportType["deck_data"]["cards"]) =>
  equip({
    [IMAGE_HERO]: {
      cards: {
        [norm(cards[0].title)]: "bronze",
        [norm(cards[2].title)]: "iridescent",
        [norm(cards[3].title)]: "silver",
      },
    },
  });

describe("resolveCardAppearance — equipped cosmetics", () => {
  beforeEach(() => {
    mockedAxios.get.mockImplementation(async (url: string) => {
      const deckId = url.replace("/evergreen-decks/", "").replace(".json", "");
      return { data: readDeck(deckId) } as never;
    });
  });
  afterEach(() => {
    jest.resetAllMocks();
    window.localStorage.clear();
    __resetCosmeticsForTest();
  });

  it("answers the equipped tier per card, and null for the rest", async () => {
    const cards = readDeck("6rDz").deck_data.cards;
    equipMixed(cards);
    const result = await renderArt([[IMAGE_HERO, "6rDz"]]);
    const tierOf = (title: string) =>
      result.current.resolveCardAppearance(IMAGE_HERO, title).rimTier;
    expect(tierOf(cards[0].title)).toBe("bronze");
    expect(tierOf(cards[2].title)).toBe("iridescent");
    expect(tierOf(cards[3].title)).toBe("silver");
    expect(tierOf(cards[1].title)).toBeNull();
    expect(tierOf(cards[4].title)).toBeNull();
  });

  it("never changes the face art it resolves alongside the treatment", async () => {
    const cards = readDeck("6rDz").deck_data.cards;
    equipMixed(cards);
    const result = await renderArt([[IMAGE_HERO, "6rDz"]]);
    for (const card of cards) {
      expect(
        result.current.resolveCardAppearance(IMAGE_HERO, card.title).cardImage,
      ).toEqual(card.cardImage ?? null);
    }
  });

  it("does not leak a tier across heroes sharing a title", async () => {
    const cards = readDeck("6rDz").deck_data.cards;
    equip({ [GENERATED_HERO]: { cards: { [norm(cards[0].title)]: "gold" } } });
    const result = await renderArt([
      [IMAGE_HERO, "6rDz"],
      [GENERATED_HERO, "taranis"],
    ]);
    expect(
      result.current.resolveCardAppearance(IMAGE_HERO, cards[0].title).rimTier,
    ).toBeNull();
  });

  it("stamps the tier onto resolveCard's card, keeping its identity stable", async () => {
    const cards = readDeck("6rDz").deck_data.cards;
    equipMixed(cards);
    const result = await renderArt([[IMAGE_HERO, "6rDz"]]);
    const upgraded = result.current.resolveCard(`${IMAGE_HERO}/c0#1`);
    const sameCardAgain = result.current.resolveCard(`${IMAGE_HERO}/c0#7`);
    const base = result.current.resolveCard(`${IMAGE_HERO}/c1#1`);
    expect(upgraded?.cosmeticRimTier).toBe("bronze");
    expect(base?.cosmeticRimTier).toBeUndefined();
    // Two instances of the same card def are the SAME object — Card/CardFactory
    // and the token cache all key on it, so a fresh copy per call would
    // re-render and re-layout every upgraded card on every parent render.
    expect(upgraded).toBe(sameCardAgain);
    // ...and the game-facing fields are byte-identical to the snapshot's.
    const { cosmeticRimTier, ...gameFacing } = upgraded!;
    expect(gameFacing).toEqual(cards[0]);
  });
});

describe("withRimTier", () => {
  const card = { title: "Feint" } as DeckImportType["deck_data"]["cards"][0];

  it("hands back the very same object when nothing is equipped", () => {
    expect(withRimTier(card, null)).toBe(card);
    expect(withRimTier(null, "gold")).toBeNull();
    expect(withRimTier(undefined, "gold")).toBeUndefined();
  });

  it("memoizes one stamped copy per (card, tier)", () => {
    const bronze = withRimTier(card, "bronze");
    expect(bronze).not.toBe(card);
    expect(withRimTier(card, "bronze")).toBe(bronze);
    expect(withRimTier(card, "silver")).not.toBe(bronze);
    // Re-stamping an already-stamped card with its own tier is a no-op.
    expect(withRimTier(bronze, "bronze")).toBe(bronze);
  });
});
