/**
 * The ad's fixed cast. Not props: this is one video about one shipped feature,
 * so the deck, the star card and the hand are written down here rather than
 * parameterized — but the ART and the card faces still come out of the shipped
 * deck JSON through the same loader the deck promos use.
 *
 * Thrall (`pk1x`) throughout. The star is **Elemental fury**, which is both one
 * of the deck's boldest faces and a ×3 card — so the same card that walks the
 * ladder in beat 2 can show "every copy wears it" in beat 4 without the viewer
 * having to re-learn a card.
 */
import type { DeckSelection } from "../shared/deck";

export const HERO_DECK_SLUG = "pk1x";
export const OPPONENT_DECK_SLUG = "p82X";

/**
 * The hand dealt in the "every copy" beat, in fan order. Captions are unused
 * here (the loader carries them for the deck promo), so they are empty.
 *
 * Index 0 is the STAR — the card the hook, the ladder and the table reveal all
 * show. The three copies are spread across the fan rather than sat next to each
 * other: "every copy" has to be legible at a glance.
 */
const HAND_TITLES = [
  "Elemental fury",
  "Lightning bolt",
  "Elemental fury",
  "Fire nova totem",
  "Elemental fury",
] as const;

/** Which fan slots hold a copy of the star card. */
export const COPY_SLOTS = HAND_TITLES.flatMap((title, index) =>
  title === HAND_TITLES[0] ? [index] : [],
);

/** The star's slot in `hero.featured`. */
export const STAR_SLOT = 0;

export const HERO_SELECTION: DeckSelection = {
  deckSlug: HERO_DECK_SLUG,
  featuredCards: HAND_TITLES.map((title) => ({ title, caption: "" })),
};

/** One card from another deck, for the "across the table" reveal. */
export const OPPONENT_SELECTION: DeckSelection = {
  deckSlug: OPPONENT_DECK_SLUG,
  featuredCards: [{ title: "cleave", caption: "" }],
};

/** Points the hero has earned when the /collection panel is read. */
export const EARNED_POINTS = 1240;
