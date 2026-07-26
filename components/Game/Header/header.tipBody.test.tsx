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
