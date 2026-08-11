import {
  AbsoluteFill,
  Sequence,
  type CalculateMetadataFunction,
} from "remotion";
import { BrandFonts } from "../fonts";
import { loadDeckPromo, type DeckPromo } from "./deck";
import { paletteFor } from "./palette";
import { deckAnnouncementSchema, type DeckAnnouncementInput } from "./schema";
import { CallToAction } from "./scenes/CallToAction";
import { ColdOpen } from "./scenes/ColdOpen";
import { HowItPlays } from "./scenes/HowItPlays";
import { Niche } from "./scenes/Niche";
import { Backdrop, SceneFade, Wordmark } from "./ui";

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

/**
 * The component takes the deck ALREADY loaded: `deckAnnouncementMetadata`
 * fetches and validates it before the first frame exists, so a bad slug or a
 * mistyped card title fails the render outright instead of quietly rendering
 * an empty video.
 */
export type DeckAnnouncementProps = DeckAnnouncementInput & {
  deck?: DeckPromo;
};

export const deckAnnouncementMetadata: CalculateMetadataFunction<
  DeckAnnouncementProps
> = async ({ props, abortSignal }) => {
  // Explicit parse: the CLI's --props file is not schema-checked for us, and a
  // props typo should read as a schema error, not as a missing scene.
  const parsed = deckAnnouncementSchema.parse(props);
  const deck = await loadDeckPromo(parsed, abortSignal);
  return {
    durationInFrames: totalDuration(
      deck.featured.length,
      Boolean(deck.hero.quote),
    ),
    props: { ...props, ...parsed, deck },
  };
};

export const DeckAnnouncement: React.FC<DeckAnnouncementProps> = ({
  tagline,
  deck,
}) => {
  if (!deck) {
    throw new Error(
      "DeckAnnouncement: no deck data. This composition must keep its calculateMetadata (deckAnnouncementMetadata), which loads public/evergreen-decks/<deckSlug>.json.",
    );
  }

  const palette = paletteFor(deck);
  const coldOpen = coldOpenFrames(Boolean(deck.hero.quote));
  const cards = PER_CARD * deck.featured.length;

  return (
    <AbsoluteFill style={{ backgroundColor: palette.deep }}>
      <BrandFonts>
        <Backdrop deck={deck} palette={palette} />

        <Sequence durationInFrames={coldOpen}>
          <SceneFade durationInFrames={coldOpen}>
            <ColdOpen deck={deck} palette={palette} />
          </SceneFade>
        </Sequence>

        <Sequence from={coldOpen} durationInFrames={NICHE}>
          <SceneFade durationInFrames={NICHE}>
            <Niche deck={deck} palette={palette} tagline={tagline} />
          </SceneFade>
        </Sequence>

        <Sequence from={coldOpen + NICHE} durationInFrames={cards}>
          <SceneFade durationInFrames={cards}>
            <HowItPlays deck={deck} palette={palette} perCard={PER_CARD} />
          </SceneFade>
        </Sequence>

        <Sequence from={coldOpen + NICHE + cards} durationInFrames={CTA}>
          <SceneFade durationInFrames={CTA}>
            <CallToAction deck={deck} palette={palette} />
          </SceneFade>
        </Sequence>

        <Wordmark palette={palette} />
      </BrandFonts>
    </AbsoluteFill>
  );
};
