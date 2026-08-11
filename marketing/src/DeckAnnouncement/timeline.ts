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

/**
 * Beat-internal cue frames — each one is its scene's OWN animation frame, so a
 * cue is `beat.from + CUE.<name>`. Both the audio layer (`audio.tsx`) and the
 * particle flourish (`Flourish.tsx`) are built from these, so retiming a beat
 * retimes its sound AND its burst together.
 */
export const CUE = {
  /** ColdOpen: nameRise starts — the deck name slams up */
  nameSlam: 48,
  /** ColdOpen: the quote begins fading in */
  quoteIn: 62,
  /** Niche: headline spring */
  nicheHeadline: 0,
  /** Niche: ability panel spring */
  nichePanel: 26,
  /** HowItPlays, per card: the enter spring has all but settled */
  cardLand: 13,
  /** HowItPlays, per card: the value/boost line reads in */
  cardStats: 22,
  /** CallToAction: StatChip delays */
  statChips: [0, 8, 16],
  /** CallToAction: ctaIn spring — the url lands */
  ctaUrl: 30,
  /** CallToAction: the cardback takes the frame */
  ctaOutro: 118,
  /** CallToAction: the 8-bit sting that buttons the video */
  ctaSting: 123,
} as const;

/** The cue frames above resolved to absolute frames for one render. */
export type PromoCues = {
  nameSlam: number;
  quoteIn: number;
  cardLands: number[];
  sting: number;
};

export const promoCues = (timeline: PromoTimeline): PromoCues => ({
  nameSlam: timeline.coldOpen.from + CUE.nameSlam,
  quoteIn: timeline.coldOpen.from + CUE.quoteIn,
  cardLands: Array.from(
    { length: timeline.cards.count },
    (_, index) =>
      timeline.cards.from + index * timeline.cards.perCard + CUE.cardLand,
  ),
  sting: timeline.cta.from + CUE.ctaSting,
});
