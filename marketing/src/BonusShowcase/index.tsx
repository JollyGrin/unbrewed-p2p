import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  type CalculateMetadataFunction,
} from "remotion";
import { BrandFonts } from "../fonts";
import { paletteFor } from "../DeckAnnouncement/palette";
import { Flourish } from "../shared/Flourish";
import { loadBonusDeck, type BonusDeck } from "../shared/deck";
import { DEFAULT_PARTICLE_STYLE } from "../shared/particles";
import { ShowcaseAudio } from "./audio";
import { effectParams, type EffectParams } from "./effects";
import { ambientDim, burstsFor } from "./flourish";
import { bonusShowcaseSchema, type BonusShowcaseInput } from "./schema";
import { Intro } from "./scenes/Intro";
import { Outro } from "./scenes/Outro";
import { RewardBeat } from "./scenes/RewardBeat";
import { Track } from "./scenes/Track";
import { showcaseTimeline } from "./timeline";
import { CircusBackdrop, SceneFade, Wordmark } from "./ui";

export { FPS, showcaseDuration } from "./timeline";

/**
 * A side-deck showcase: a deck's bonus cards (POMNI's Adventures and their
 * Rewards) dealt into a track, then played one by one — front read, completed,
 * flipped, and the back's mechanic acted out as a short vignette. Driven by a
 * props file; the deck JSON supplies every card, text and number.
 */
export type BonusShowcaseProps = BonusShowcaseInput & {
  deck?: BonusDeck;
  effects?: EffectParams[];
};

export const bonusShowcaseMetadata: CalculateMetadataFunction<
  BonusShowcaseProps
> = async ({ props, abortSignal }) => {
  const parsed = bonusShowcaseSchema.parse(props);
  const deck = await loadBonusDeck(
    { deckSlug: parsed.deckSlug, pairs: parsed.beats },
    abortSignal,
  );
  // read every vignette's numbers now, so a reward whose text does not fit
  // its mechanic fails before frame 0
  const effects = parsed.beats.map((beat, index) =>
    effectParams(beat.effect, deck.pairs[index].back, deck),
  );
  return {
    durationInFrames: showcaseTimeline(deck.pairs.length).total,
    props: { ...props, ...parsed, deck, effects },
  };
};

const FlourishLayer: React.FC<{
  deck: BonusDeck;
  palette: ReturnType<typeof paletteFor>;
  particleStyle: BonusShowcaseInput["particleStyle"];
}> = ({ deck, palette, particleStyle }) => {
  const frame = useCurrentFrame();
  const timeline = showcaseTimeline(deck.pairs.length);
  return (
    <Flourish
      palette={palette}
      style={particleStyle ?? DEFAULT_PARTICLE_STYLE}
      dim={ambientDim(frame, timeline)}
      bursts={burstsFor(timeline)}
    />
  );
};

export const BonusShowcase: React.FC<BonusShowcaseProps> = ({
  intro,
  outro,
  beats,
  stripeColours,
  musicTrack,
  particleStyle,
  backdropColour,
  deck,
  effects,
}) => {
  if (!deck || !effects) {
    throw new Error(
      "BonusShowcase: no deck data. This composition must keep its calculateMetadata (bonusShowcaseMetadata), which loads public/evergreen-decks/<deckSlug>.json.",
    );
  }
  const palette = paletteFor(deck, backdropColour);
  const stripes: [string, string] = stripeColours ?? [
    palette.accent,
    palette.base,
  ];
  const timeline = showcaseTimeline(deck.pairs.length);

  return (
    <AbsoluteFill style={{ backgroundColor: palette.deep }}>
      <BrandFonts>
        <CircusBackdrop palette={palette} stripes={stripes} />
        <FlourishLayer
          deck={deck}
          palette={palette}
          particleStyle={particleStyle}
        />

        <Sequence durationInFrames={timeline.intro.duration}>
          <SceneFade durationInFrames={timeline.intro.duration} fadeOut={0}>
            <Intro deck={deck} palette={palette} intro={intro} />
          </SceneFade>
        </Sequence>

        {/* the card row lives across every scene, so it is not in a Sequence */}
        <Track deck={deck} palette={palette} timeline={timeline} />

        {timeline.beats.map((beat, index) => (
          <Sequence
            key={index}
            from={beat.from}
            durationInFrames={beat.duration}
          >
            <RewardBeat
              deck={deck}
              palette={palette}
              stripes={stripes}
              index={index}
              front={deck.pairs[index].front}
              back={deck.pairs[index].back}
              params={effects[index]}
              caption={beats[index].caption}
              still={beats[index].still}
            />
          </Sequence>
        ))}

        <Sequence
          from={timeline.outro.from}
          durationInFrames={timeline.outro.duration}
        >
          <SceneFade durationInFrames={timeline.outro.duration} fadeIn={8}>
            <Outro deck={deck} palette={palette} outro={outro} />
          </SceneFade>
        </Sequence>

        <Wordmark palette={palette} />
        <ShowcaseAudio
          timeline={timeline}
          effects={effects}
          musicTrack={musicTrack}
        />
      </BrandFonts>
    </AbsoluteFill>
  );
};
