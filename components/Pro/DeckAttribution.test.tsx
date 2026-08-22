/**
 * Where a deck's "by <author>" credit points — the ONE resolver every surface
 * that shows a deck source link goes through (the /pro roster tile via
 * ProLanding, the /pro/game hero splash). Two rules are load-bearing and easy
 * to regress:
 *
 *   1. an explicit `sourceUrl` beats the id-derived unmatched.cards link, even
 *      when the deck really does have an unmatched.cards page (Skull Kid, #665);
 *   2. an evergreen `original` with no source page links nowhere at all, rather
 *      than to a dead unmatched.cards URL.
 *
 * These assert against the REAL POPULAR_DECKS entries rather than fixtures, so
 * editing a tile's attribution has to come past this file. The hero-preview
 * modal renders the same component off the same resolver (#665) — its own suite
 * pins that it appears there.
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { DeckAttribution, deckAttributionHref } from "./DeckAttribution";
import { POPULAR_DECKS, type PopularDeckMeta } from "@/lib/constants/top-decks";

const SKULL_KID_CLUB_URL =
  "https://www.the-unmatched.club/c/heroes/skull-kid-the-legend-of-zelda.2748";

const tile = (id: string): PopularDeckMeta => {
  const deck = POPULAR_DECKS.find((d) => d.id === id);
  if (!deck) throw new Error(`no POPULAR_DECKS entry for ${id}`);
  return deck;
};

describe("deckAttributionHref", () => {
  it("credits Skull Kid to the authors' the-unmatched.club page, not the zmGV mirror", () => {
    const skullKid = tile("zmGV");
    expect(skullKid.author).toBe("AndSushi + DreamCarver");
    expect(deckAttributionHref(skullKid)).toBe(SKULL_KID_CLUB_URL);
    expect(deckAttributionHref(skullKid)).not.toContain("unmatched.cards");
  });

  it("still derives the unmatched.cards page for a deck with no sourceUrl", () => {
    const derived = POPULAR_DECKS.find((d) => !d.sourceUrl && !d.original);
    expect(derived).toBeDefined();
    expect(deckAttributionHref(derived!)).toBe(
      `https://unmatched.cards/decks/${derived!.id}`,
    );
  });

  it("leaves an evergreen original with no source page unlinked", () => {
    expect(
      deckAttributionHref({ ...tile("doppelganger"), sourceUrl: undefined }),
    ).toBeUndefined();
  });

  it("keeps the other decks' explicit source links intact", () => {
    expect(deckAttributionHref(tile("grievous"))).toBe(
      "https://www.the-unmatched.club/c/heroes/general-grievous.9861",
    );
    expect(deckAttributionHref(tile("6rDz"))).toBe(
      "https://unmatched.cards/decks/6rDz/versions/WvW4T24Nq",
    );
  });
});

describe("<DeckAttribution /> — the rendered credit", () => {
  it("renders Skull Kid's credit as a link to the club page", () => {
    render(
      <ChakraProvider>
        <DeckAttribution deck={tile("zmGV")} />
      </ChakraProvider>,
    );
    const link = screen.getByRole("link", {
      name: /AndSushi \+ DreamCarver's deck on the-unmatched\.club/i,
    });
    expect(link).toHaveAttribute("href", SKULL_KID_CLUB_URL);
    expect(link).toHaveTextContent("AndSushi + DreamCarver");
  });
});
