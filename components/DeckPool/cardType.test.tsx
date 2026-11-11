import { render } from "@testing-library/react";
import { cloneDeep } from "lodash";
import { mockDeck } from "@/_mocks_/deck";
import IconSvgClass from "../CardFactory/IconSvg";
import { CardSvg, CardFactory } from "../CardFactory/card.factory";
import { calculateProps, getMeasureCanvas } from "../CardFactory/card.helpers";
import { normalizeCardType, withNormalizedType } from "./cardType";
import { DeckImportCardType, DeckImportType } from "./deck-import.type";
import { newPool } from "./PoolFns";

// IconSvg is `@ts-nocheck`, so its props are untyped
const IconSvg = IconSvgClass as unknown as React.FC<{
  cardType: unknown;
  width: number;
  x: number;
  y: number;
  fill: string;
}>;

/** Issue #1604: a card typed "defense" (US spelling) crashed the table. */
describe("normalizeCardType", () => {
  it.each(["defense", "Defense", " DEFENCE ", "defence"])("%j -> defence", (t) => {
    expect(normalizeCardType(t)).toBe("defence");
  });

  it.each([
    ["attack", "attack"],
    ["ATTACK", "attack"],
    ["Versatile", "versatile"],
    ["versatile", "versatile"],
    [" Scheme", "scheme"],
    ["scheme", "scheme"],
  ])("%j -> %s", (t, want) => {
    expect(normalizeCardType(t)).toBe(want);
  });

  it.each([undefined, null, "", "hybrid", 3])("%j -> versatile", (t) => {
    expect(normalizeCardType(t)).toBe("versatile");
  });

  it("withNormalizedType keeps an already-valid card by identity", () => {
    const card = { type: "attack" as const, title: "x" };
    expect(withNormalizedType(card)).toBe(card);
  });
});

const defenseDeck = (): DeckImportType => {
  const deck = cloneDeep(mockDeck) as DeckImportType;
  deck.deck_data.cards[0] = {
    ...deck.deck_data.cards[0],
    title: "DIVIDER",
    type: "defense" as DeckImportCardType["type"],
  };
  return deck;
};

describe("newPool", () => {
  it("normalizes a defense card to defence", () => {
    const pool = newPool(defenseDeck());
    expect(pool.cards[0]).toMatchObject({ title: "DIVIDER", type: "defence" });
  });
});

describe("IconSvg", () => {
  it.each(["defense", undefined, "hybrid"])("cardType=%j does not throw", (cardType) => {
    expect(() =>
      render(
        <svg>
          <IconSvg cardType={cardType} width={6} x={0} y={0} fill="#fff" />
        </svg>,
      ),
    ).not.toThrow();
  });

  it("still draws a known type", () => {
    const { container } = render(
      <svg>
        <IconSvg cardType="defence" width={6} x={0} y={0} fill="#fff" />
      </svg>,
    );
    expect(container.querySelector("path")).not.toBeNull();
  });
});

describe("card face", () => {
  const card = {
    ...defenseDeck().deck_data.cards[0],
    cardImage: undefined,
  } as DeckImportCardType;

  it("CardSvg draws a defense card as defence", () => {
    const props = calculateProps(card, getMeasureCanvas()!);
    const { container } = render(<CardSvg card={card} props={props} />);
    expect(container.querySelector("polygon.defence")).not.toBeNull();
    // the defence icon, not an empty slot
    expect(container.querySelector('svg[viewBox="0 0 6870 7830"]')).not.toBeNull();
  });

  it("CardFactory renders a defense card without throwing", () => {
    expect(() => render(<CardFactory card={card} />)).not.toThrow();
  });
});
