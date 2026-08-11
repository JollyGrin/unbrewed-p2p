/**
 * The promo's frame budget, in one place. Both the visual Sequences
 * (`index.tsx`) and the audio cues (`audio.tsx`) are built from this, so
 * retiming a beat retimes its sound with it.
 */

export const FPS = 30;

/** Scene lengths in frames. A 3-card deck runs 1030f (34.3s), a 4-card deck
 * 1170f (39s) — the top of the 20–40s brief. */
export const NICHE = 180;
export const PER_CARD = 140;
export const CTA = 180;

/**
 * The cold open is sized around its longest-lived text: the hero quote runs
 * 25–35 words and has to be comfortably readable before the cut, which takes
 * ~5.5s of hold on top of the cardback turn. Decks that ship no quote (cairne)
 * would just sit on a still frame, so they get the short version.
 */
export const coldOpenFrames = (hasQuote: boolean) => (hasQuote ? 250 : 160);

export const totalDuration = (featuredCount: number, hasQuote: boolean) =>
  coldOpenFrames(hasQuote) + NICHE + PER_CARD * featuredCount + CTA;

export type Beat = { from: number; duration: number };

export type PromoTimeline = {
  coldOpen: Beat;
  niche: Beat;
  /** All featured cards as one beat; `perCard` slices it. */
  cards: Beat & { perCard: number; count: number };
  cta: Beat;
  total: number;
};

export const promoTimeline = (
  featuredCount: number,
  hasQuote: boolean,
): PromoTimeline => {
  const coldOpen = coldOpenFrames(hasQuote);
  const cards = PER_CARD * featuredCount;
  return {
    coldOpen: { from: 0, duration: coldOpen },
    niche: { from: coldOpen, duration: NICHE },
    cards: {
      from: coldOpen + NICHE,
      duration: cards,
      perCard: PER_CARD,
      count: featuredCount,
    },
    cta: { from: coldOpen + NICHE + cards, duration: CTA },
    total: coldOpen + NICHE + cards + CTA,
  };
};
