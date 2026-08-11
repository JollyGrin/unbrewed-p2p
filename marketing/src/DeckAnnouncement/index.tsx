import {
  AbsoluteFill,
  Sequence,
  type CalculateMetadataFunction,
} from "remotion";
import { BrandFonts } from "../fonts";
import { PromoAudio } from "./audio";
import { Flourish } from "./Flourish";
import { loadDeckPromo, type DeckPromo } from "./deck";
import { paletteFor } from "./palette";
import { deckAnnouncementSchema, type DeckAnnouncementInput } from "./schema";
import { CallToAction } from "./scenes/CallToAction";
import { ColdOpen } from "./scenes/ColdOpen";
import { cardAnchor, HowItPlays } from "./scenes/HowItPlays";
import { Niche } from "./scenes/Niche";
import { promoTimeline } from "./timeline";
import { Backdrop, SceneFade, Wordmark } from "./ui";

export {
  coldOpenFrames,
  CTA,
  FPS,
  NICHE,
  PER_CARD,
  promoTimeline,
  totalDuration,
} from "./timeline";

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
    durationInFrames: promoTimeline(
      deck.featured.length,
      Boolean(deck.hero.quote),
    ).total,
    props: { ...props, ...parsed, deck },
  };
};

export const DeckAnnouncement: React.FC<DeckAnnouncementProps> = ({
  tagline,
  musicTrack,
  particleStyle,
  deck,
}) => {
  if (!deck) {
    throw new Error(
      "DeckAnnouncement: no deck data. This composition must keep its calculateMetadata (deckAnnouncementMetadata), which loads public/evergreen-decks/<deckSlug>.json.",
    );
  }

  const palette = paletteFor(deck);
  const hasQuote = Boolean(deck.hero.quote);
  const timeline = promoTimeline(deck.featured.length, hasQuote);
  const { coldOpen, niche, cards, cta } = timeline;

  return (
    <AbsoluteFill style={{ backgroundColor: palette.deep }}>
      <BrandFonts>
        <Backdrop deck={deck} palette={palette} />

        {/* behind every scene: ambient field + a burst on each audio cue */}
        <Flourish
          palette={palette}
          timeline={timeline}
          hasQuote={hasQuote}
          particleStyle={particleStyle}
          cardAnchors={deck.featured.map((_, index) =>
            cardAnchor(index, deck.featured.length),
          )}
        />

        <Sequence durationInFrames={coldOpen.duration}>
          <SceneFade durationInFrames={coldOpen.duration}>
            <ColdOpen deck={deck} palette={palette} />
          </SceneFade>
        </Sequence>

        <Sequence from={niche.from} durationInFrames={niche.duration}>
          <SceneFade durationInFrames={niche.duration}>
            <Niche deck={deck} palette={palette} tagline={tagline} />
          </SceneFade>
        </Sequence>

        <Sequence from={cards.from} durationInFrames={cards.duration}>
          <SceneFade durationInFrames={cards.duration}>
            <HowItPlays deck={deck} palette={palette} perCard={cards.perCard} />
          </SceneFade>
        </Sequence>

        <Sequence from={cta.from} durationInFrames={cta.duration}>
          <SceneFade durationInFrames={cta.duration}>
            <CallToAction deck={deck} palette={palette} />
          </SceneFade>
        </Sequence>

        <Wordmark palette={palette} />

        <PromoAudio
          timeline={timeline}
          hasQuote={hasQuote}
          musicTrack={musicTrack}
        />
      </BrandFonts>
    </AbsoluteFill>
  );
};
