/**
 * The /collection hero list (#614, #625). Two rules are the whole file: a hero
 * the client has never heard of is still listed — hiding one would make
 * somebody's purchases look like they vanished — and a reflavored baseline
 * never is, points or no points, because nobody can take one to the table.
 */
import { collectionRoster } from "./roster";
import { HERO_DECK_IDS } from "@/lib/pro/useProCardArt";
import { cardSetsOf } from "./useHeroDeck";

describe("collectionRoster", () => {
  it("leads with the API's heroes, in the API's order", () => {
    const roster = collectionRoster(["thrall", "batman"]);
    expect(roster.slice(0, 2).map((h) => h.heroId)).toEqual(["thrall", "batman"]);
    expect(roster[0]).toMatchObject({ deckId: "pk1x", name: "Thrall" });
  });

  it("lists the rest of the Pro roster alphabetically behind them", () => {
    const rest = collectionRoster([]).map((h) => h.name);
    expect([...rest].sort((a, b) => a.localeCompare(b))).toEqual(rest);
  });

  it("drops every reflavored baseline, even one the API reports points on", () => {
    const baselines = ["thetis", "king-taranis", "piper-of-the-underroads", "hollow-oak"];
    for (const heroId of baselines) {
      expect(collectionRoster([]).some((h) => h.heroId === heroId)).toBe(false);
      // #625: the API stops reporting these ids, but a stale row must not
      // resurrect a hero the player cannot play.
      expect(collectionRoster([heroId]).some((h) => h.heroId === heroId)).toBe(false);
    }
    // ...and the successor keeps the plain name — the ★ that told them apart
    // has nothing left to disambiguate.
    const spice = collectionRoster([]).find((h) => h.heroId === "thetis-spice");
    expect(spice?.name).toBe("Thetis");
    expect(collectionRoster([]).some((h) => h.name.includes("★"))).toBe(false);
  });

  it("keeps a hero only the API knows about, naming it from its id", () => {
    const roster = collectionRoster(["some-retired-hero"]);
    expect(roster[0]).toMatchObject({
      heroId: "some-retired-hero",
      deckId: null,
      name: "Some Retired Hero",
    });
  });

  it("ignores a duplicate or empty id from the API", () => {
    const roster = collectionRoster(["thrall", "thrall", ""]);
    expect(roster.filter((h) => h.heroId === "thrall")).toHaveLength(1);
  });

  it("gives every listed hero a deck id the snapshot bundle actually has", () => {
    const known = new Set(Object.values(HERO_DECK_IDS));
    for (const hero of collectionRoster([])) {
      expect(known.has(hero.deckId ?? "")).toBe(true);
    }
  });
});

describe("cardSetsOf", () => {
  const deck = (cards: unknown[]) =>
    ({ deck_data: { cards } }) as never;

  it("folds copies of a title into ONE set", () => {
    const sets = cardSetsOf(
      deck([
        { title: "Feint", quantity: 2 },
        { title: " feint ", quantity: 1 },
      ]),
    );
    expect(sets).toHaveLength(1);
    expect(sets[0]).toMatchObject({ key: "feint", title: "Feint", quantity: 3 });
  });

  it("skips character/rule cards and untitled rows", () => {
    const sets = cardSetsOf(
      deck([
        { title: "Undertow", quantity: 1 },
        { title: "Board cap", quantity: 1, isCharacterCard: true },
        { title: "   ", quantity: 1 },
      ]),
    );
    expect(sets.map((s) => s.key)).toEqual(["undertow"]);
  });

  it("survives a snapshot with no cards at all", () => {
    expect(cardSetsOf({} as never)).toEqual([]);
  });
});
