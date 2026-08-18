/**
 * The metal-rim ladder on cards (#612, design doc §5/§6/§9b) — the card-side
 * half of the shared cosmetic ladder (#613 paints the fighter token with the
 * same four tiers). The ladder's colour grammar is pinned in
 * `lib/pro/cosmetics.test.ts`, where the paints live; what is pinned HERE is
 * the rendering: that each card wears its OWN tier on every render path, and
 * that the rim changes nothing about the card as a game object.
 *
 * Every fixture is MIXED-TIER — some cards upgraded, at different tiers, some
 * deliberately left at base art. A uniform fixture passes while the per-card
 * lookup is broken, which is the exact failure this feature invites.
 */
import "@testing-library/jest-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "@testing-library/react";
import { cardTokenMarkup } from "@/components/BoardCanvas/Tokens/cardFace";
import {
  DeckImportCardType,
  DeckImportType,
} from "@/components/DeckPool/deck-import.type";
import { withRimTier } from "@/lib/pro/cardAppearance";
import {
  COSMETIC_RIM_STOPS,
  COSMETIC_RIM_TIERS,
  CosmeticRimTier,
} from "@/lib/pro/cosmetics";
import { Card } from "./Card";
import { rimBodyId } from "./cardRim";

const DECKS_DIR = join(__dirname, "..", "..", "public", "evergreen-decks");
const deckCards = (deckId: string): DeckImportCardType[] =>
  (
    JSON.parse(
      readFileSync(join(DECKS_DIR, `${deckId}.json`), "utf8"),
    ) as DeckImportType
  ).deck_data.cards;

/** Kenshiro: every card is a flat `cardImage` bitmap (ImageFace path). */
const IMAGE_DECK = deckCards("6rDz");
/** King Taranis: no `cardImage` anywhere (generated CardSvg template path). */
const GENERATED_DECK = deckCards("taranis");

/** Some upgraded, at different tiers; two left at base art on purpose. */
const LADDER: (CosmeticRimTier | null)[] = [
  "bronze",
  null,
  "iridescent",
  "silver",
  null,
  "gold",
];

const mixedDeck = (cards: DeckImportCardType[]): DeckImportCardType[] =>
  LADDER.map((tier, i) => withRimTier(cards[i], tier));

const rimTiersIn = (root: ParentNode): string[] =>
  Array.from(root.querySelectorAll("[data-cosmetic-rim]")).map(
    (el) => el.getAttribute("data-cosmetic-rim") ?? "",
  );

/** The tiers a mixed fixture should paint, in deck order. */
const EXPECTED = LADDER.filter(Boolean) as string[];

describe("CardRim — DOM render path (hand, grids, hover preview)", () => {
  it.each([
    ["image deck", IMAGE_DECK],
    ["generated deck", GENERATED_DECK],
  ])("paints each card's own tier and nothing else on a %s", (_k, cards) => {
    const { container } = render(
      <>
        {mixedDeck(cards).map((card, i) => (
          <Card key={i} card={card} />
        ))}
      </>,
    );
    expect(rimTiersIn(container)).toEqual(EXPECTED);
  });

  it.each([
    ["image deck", IMAGE_DECK],
    ["generated deck", GENERATED_DECK],
  ])("draws no rim at all for an un-upgraded %s card", (_k, cards) => {
    const { container } = render(<Card card={cards[0]} />);
    expect(container.querySelector("[data-cosmetic-rim]")).toBeNull();
  });

  it("references the tier's own gradient, so tiers can't render alike", () => {
    const { container } = render(
      <Card card={withRimTier(IMAGE_DECK[0], "gold")} />,
    );
    const rim = container.querySelector('[data-cosmetic-rim="gold"] rect');
    expect(rim).toHaveAttribute("stroke", `url(#${rimBodyId("gold")})`);
    expect(container.querySelector(`#${rimBodyId("gold")}`)).not.toBeNull();
  });

  it("paints the SHARED ladder's colours, not a second card-only palette", () => {
    // The token rim (#613) and this one must be the same four rewards: these
    // stops come straight from COSMETIC_RIM_PAINTS via COSMETIC_RIM_STOPS.
    const { container } = render(
      <Card card={withRimTier(IMAGE_DECK[0], "bronze")} />,
    );
    const painted = Array.from(
      container.querySelectorAll(`#${rimBodyId("bronze")} stop`),
    ).map((s) => s.getAttribute("stop-color")?.toLowerCase());
    expect(painted).toEqual(
      COSMETIC_RIM_STOPS.bronze.map((s) => s.color.toLowerCase()),
    );
  });
});

describe("CardRim — board-token render path (cardFace.tsx)", () => {
  const markup = (card: DeckImportCardType, id = "tok") =>
    cardTokenMarkup({ id, card, w: 63, h: 88 });

  it.each([
    ["image deck", IMAGE_DECK],
    ["generated deck", GENERATED_DECK],
  ])("string-renders each card's own tier on a %s", (_k, cards) => {
    const tiers = mixedDeck(cards).map(
      (card, i) =>
        /data-cosmetic-rim="(\w+)"/.exec(markup(card, `tok-${_k}-${i}`))?.[1] ??
        null,
    );
    expect(tiers).toEqual(LADDER);
  });

  it("keys the markup cache on the tier — an upgrade is never stale", () => {
    // Same token id, same size: only the cosmetic changed. Without the tier in
    // the cache key the later calls return the first card's markup.
    const base = markup(IMAGE_DECK[0], "same-id");
    const bronze = markup(withRimTier(IMAGE_DECK[0], "bronze"), "same-id");
    const iridescent = markup(
      withRimTier(IMAGE_DECK[0], "iridescent"),
      "same-id",
    );
    expect(base).not.toContain("data-cosmetic-rim");
    expect(bronze).toContain('data-cosmetic-rim="bronze"');
    expect(iridescent).toContain('data-cosmetic-rim="iridescent"');
    // ...and the cache still works: same input, same string.
    expect(markup(withRimTier(IMAGE_DECK[0], "bronze"), "same-id")).toBe(
      bronze,
    );
  });

  it("is deterministic across tokens — stable ids keep the fuzz/snapshots still", () => {
    // Gradient ids are scoped to the TIER, not the card instance, so two cards
    // at the same tier emit identical defs. That is what keeps
    // `pro:render-fuzz` and jest snapshots from diffing on every run.
    const rimOf = (id: string) =>
      /<g[^>]*data-cosmetic-rim="iridescent".*?<\/g>/s.exec(
        cardTokenMarkup({
          id,
          card: withRimTier(IMAGE_DECK[0], "iridescent"),
          w: 63,
          h: 88,
        }),
      )?.[0];
    expect(rimOf("token-a")).toBeTruthy();
    expect(rimOf("token-a")).toBe(rimOf("token-b"));
  });

  it.each([
    ["image deck", IMAGE_DECK],
    ["generated deck", GENERATED_DECK],
  ])(
    "renders byte-identical BACKS for every tier of a mixed %s (no info leak)",
    (_k, cards) => {
      // §4a: a face-down card must reveal nothing. Backs are compared across
      // tiers with the tier varying and everything else pinned.
      const backs = ([null, ...COSMETIC_RIM_TIERS] as (
        | CosmeticRimTier
        | null
      )[]).map((tier) =>
        cardTokenMarkup({
          id: `back-${_k}`,
          card: withRimTier(cards[0], tier),
          faceDown: true,
          w: 63,
          h: 88,
          owner: "Dean",
          color: "#E7CC98",
        }),
      );
      for (const back of backs) {
        expect(back).toBe(backs[0]);
        expect(back).not.toContain("data-cosmetic-rim");
      }
    },
  );

  it("leaves a mixed deck's backs identical to each other, tiers and all", () => {
    const backs = mixedDeck(IMAGE_DECK).map((card) =>
      cardTokenMarkup({
        id: "one-back",
        card: { ...card, title: IMAGE_DECK[0].title },
        faceDown: true,
        w: 63,
        h: 88,
      }),
    );
    expect(new Set(backs).size).toBe(1);
  });
});

describe("the invariant — a rim changes how a card looks and nothing else", () => {
  it.each([
    ["image deck", IMAGE_DECK],
    ["generated deck", GENERATED_DECK],
  ])("never changes the 63x88 viewBox of a %s card", (_k, cards) => {
    const viewBoxes = (card: DeckImportCardType) =>
      Array.from(
        render(<Card card={card} />).container.querySelectorAll("svg"),
      ).map((svg) => svg.getAttribute("viewBox"));
    const base = viewBoxes(cards[0]);
    expect(base.length).toBeGreaterThan(0);
    for (const tier of COSMETIC_RIM_TIERS) {
      expect(viewBoxes(withRimTier(cards[0], tier))).toEqual(base);
    }
  });

  it("takes no pointer events, so the hitbox is untouched", () => {
    const { container } = render(
      <Card card={withRimTier(IMAGE_DECK[0], "silver")} />,
    );
    const rim = container.querySelector('[data-cosmetic-rim="silver"]');
    expect(rim).toHaveAttribute("pointer-events", "none");
    expect(rim).toHaveAttribute("aria-hidden", "true");
  });

  it("is the LAST child of the card svg — overlay, not a z-order change", () => {
    const { container } = render(
      <Card card={withRimTier(IMAGE_DECK[0], "iridescent")} />,
    );
    const rim = container.querySelector('[data-cosmetic-rim="iridescent"]')!;
    // SVG z-order IS document order, so "last child of the card svg" is the
    // whole statement: the rim paints over the face without introducing any
    // stacking context of its own.
    expect(rim.parentElement?.tagName.toLowerCase()).toBe("svg");
    expect(rim.parentElement?.lastElementChild).toBe(rim);
  });

  it("stays strictly inside the card box (nothing bleeds past the edge)", () => {
    const { container } = render(
      <Card card={withRimTier(IMAGE_DECK[0], "bronze")} />,
    );
    for (const rect of Array.from(
      container.querySelectorAll('[data-cosmetic-rim="bronze"] rect'),
    )) {
      const num = (a: string) => Number(rect.getAttribute(a));
      const half = num("stroke-width") / 2;
      const EPS = 1e-6; // float noise from the inset arithmetic, not a bleed
      expect(num("x") - half).toBeGreaterThanOrEqual(-EPS);
      expect(num("y") - half).toBeGreaterThanOrEqual(-EPS);
      expect(num("x") + num("width") + half).toBeLessThanOrEqual(63 + EPS);
      expect(num("y") + num("height") + half).toBeLessThanOrEqual(88 + EPS);
    }
  });

  it("never animates — nothing in a hand moves, at any tier (§9b)", () => {
    for (const tier of COSMETIC_RIM_TIERS) {
      const markup = cardTokenMarkup({
        id: `still-${tier}`,
        card: withRimTier(IMAGE_DECK[0], tier),
        w: 63,
        h: 88,
      });
      expect(markup).not.toMatch(
        /<animate|animateTransform|animation|@keyframes|hue-rotate/,
      );
    }
  });

  it("sizes every tier identically, so no rung can dominate readability", () => {
    const widths = COSMETIC_RIM_TIERS.map((tier) => {
      const { container } = render(
        <Card card={withRimTier(IMAGE_DECK[0], tier)} />,
      );
      return Array.from(
        container.querySelectorAll(`[data-cosmetic-rim="${tier}"] rect`),
      ).map((r) => r.getAttribute("stroke-width"));
    });
    for (const w of widths) expect(w).toEqual(widths[0]);
  });
});
