import { mockDeck as _mockDeck } from "@/_mocks_/deck";
import { clone } from "lodash";
import { newPool } from "./PoolFns";

describe("newPool", () => {
  test("copies the deck meta and fighters", () => {
    const mockDeck = clone(_mockDeck);
    const pool = newPool(mockDeck);
    expect(pool.deckName).toBe(mockDeck.name);
    expect(pool.hero.specialAbility).toBe(mockDeck.deck_data.hero.specialAbility);
    expect(pool.sidekick.name).toBe(mockDeck.deck_data.sidekick.name);
  });

  // issue #372: deck-level "extra rules" cards (e.g. Clone Troopers' board cap)
  // used to be dropped by the pool transform; they must now thread through so the
  // legacy game header can render them.
  test("threads ruleCards through, defaulting to [] when absent", () => {
    const mockDeck = clone(_mockDeck);
    const pool = newPool(mockDeck);
    expect(pool.ruleCards).toEqual(mockDeck.deck_data.ruleCards);
    expect(pool.ruleCards.length).toBeGreaterThan(0);

    const noRules = clone(_mockDeck);
    delete (noRules.deck_data as { ruleCards?: unknown }).ruleCards;
    expect(newPool(noRules).ruleCards).toEqual([]);
  });
});
