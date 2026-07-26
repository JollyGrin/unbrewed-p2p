import { render, screen } from "@testing-library/react";
import { TipBody } from "./header.components";
import { PoolType } from "@/components/DeckPool/PoolFns";

/**
 * unmatched.cards always emits a sidekick object, even for decks that field no
 * sidekick — the shape below is what the deck API returns live for `G1dWD`
 * (Urshifu Rapid Strike). `isRanged: true` is their form default sitting on an
 * unused sidekick, which is why the unguarded tooltip read ": Ranged".
 */
const pool = (sidekick: PoolType["sidekick"]): PoolType =>
  ({
    deckName: "Urshifu Rapid Strike",
    hero: {
      hp: 16,
      isRanged: false,
      move: 3,
      name: "Urshifu",
      specialAbility: "Urshifu starts with a maneuver then gets 2 actions",
    },
    sidekick,
    ruleCards: [],
  }) as unknown as PoolType;

const noSidekick = { hp: null, isRanged: true, name: "", quantity: 0, quote: "" };
const withSidekick = {
  hp: 4,
  isRanged: true,
  name: "Pikachu",
  quantity: 3,
  quote: "Pika pika",
};

describe("TipBody — sidekick gating (issue #494)", () => {
  it("hides the sidekick block for the unmatched.cards no-sidekick stub", () => {
    const { container } = render(<TipBody pool={pool(noSidekick)} />);

    // the phantom line was a bare ": Ranged" under a divider
    expect(screen.queryByText(/Ranged/)).toBeNull();
    expect(container.querySelectorAll("hr")).toHaveLength(1); // hero divider only

    // the hero half is untouched
    expect(screen.getByText("Urshifu Rapid Strike")).toBeTruthy();
    expect(screen.getByText(/Urshifu: Melee/)).toBeTruthy();
    expect(
      screen.getByText("Urshifu starts with a maneuver then gets 2 actions"),
    ).toBeTruthy();
  });

  it("renders name, type and quote for a deck that does have a sidekick", () => {
    const { container } = render(<TipBody pool={pool(withSidekick)} />);

    expect(screen.getByText(/Pikachu: Ranged/)).toBeTruthy();
    expect(screen.getByText("Pika pika")).toBeTruthy();
    expect(container.querySelectorAll("hr")).toHaveLength(2);
  });

  it("spells melee correctly and skips an empty special ability", () => {
    const bare = pool(noSidekick);
    const { container } = render(
      <TipBody pool={{ ...bare, hero: { ...bare.hero, specialAbility: "" } }} />,
    );

    expect(container.textContent).not.toMatch(/Meele/);
    // deckName, hero line — no empty <p> where the ability would be
    expect(container.querySelectorAll("p")).toHaveLength(2);
  });
});

/**
 * issue #500: Skeleton King's "hero" is three character cards. The pool now
 * carries the extras, and the tooltip has to name all of them — the panel showed
 * only the first, so two of the three characters were invisible in-game.
 */
describe("TipBody — extra characters (issue #500)", () => {
  const skeletons = [
    {
      hero: { hp: 1, isRanged: false, move: 2, name: "skeleton", specialAbility: "this is larry" },
      sidekick: noSidekick,
    },
    {
      hero: { hp: 1, isRanged: false, move: 2, name: "ghost skeleton", specialAbility: "larry but dead" },
      sidekick: noSidekick,
    },
  ];

  it("lists every extra character with its stats and ability", () => {
    const { container } = render(
      <TipBody
        pool={{ ...pool(noSidekick), extraCharacters: skeletons } as PoolType}
      />,
    );

    // both names get their own labelled line, after a divider
    expect(screen.getAllByText(/skeleton:/)).toHaveLength(2);
    expect(screen.getByText(/ghost skeleton:/)).toBeTruthy();
    expect(container.textContent).toMatch(/skeleton: *Melee, 1 HP, move 2/);
    expect(screen.getByText("this is larry")).toBeTruthy();
    expect(screen.getByText("larry but dead")).toBeTruthy();
    expect(container.querySelectorAll("hr")).toHaveLength(2); // hero + extras
    // the extras' placeholder sidekicks stay hidden
    expect(screen.queryByText(/Sidekick/)).toBeNull();
  });

  it("renders nothing extra for the decks that have none", () => {
    const { container } = render(
      <TipBody pool={{ ...pool(noSidekick), extraCharacters: [] } as PoolType} />,
    );
    // deckName, hero line, ability — same three as before the field existed
    expect(container.querySelectorAll("p")).toHaveLength(3);
  });
});
