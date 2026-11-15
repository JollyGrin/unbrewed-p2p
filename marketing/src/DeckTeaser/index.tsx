import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  type CalculateMetadataFunction,
} from "remotion";
import {
  effectParams,
  rulesOf,
  type EffectParams,
} from "../BonusShowcase/effects";
import { RewardBeat } from "../BonusShowcase/scenes/RewardBeat";
import { CircusBackdrop, SceneFade, Wordmark } from "../BonusShowcase/ui";
import { paletteFor } from "../DeckAnnouncement/palette";
import { CallToAction } from "../DeckAnnouncement/scenes/CallToAction";
import { ColdOpen } from "../DeckAnnouncement/scenes/ColdOpen";
import { BrandFonts } from "../fonts";
import type { Palette } from "../shared/color";
import { Flourish } from "../shared/Flourish";
import { loadBonusDeck, type BonusDeck } from "../shared/deck";
import { DEFAULT_PARTICLE_STYLE } from "../shared/particles";
import { TeaserAudio } from "./audio";
import { ambientDim, burstsFor } from "./flourish";
import { playParams, type PlayParams } from "./plays";
import { deckTeaserSchema, type DeckTeaserInput } from "./schema";
import { Montage } from "./scenes/Montage";
import { Play } from "./scenes/Play";
import { TeaserTrack } from "./scenes/TeaserTrack";
import { teaserTimeline } from "./timeline";

export { teaserTimeline } from "./timeline";

/**
 * The blended cut: what a game of the deck FEELS like, in under 40s. The hero
 * opens (DeckAnnouncement's ColdOpen); highlight cards are played as turns
 * with the side deck advancing along the top; featured rewards play in full
 * (BonusShowcase's RewardBeat), the rest flash past; the last highlight is the
 * payoff; DeckAnnouncement's CallToAction closes. Built from those two
 * compositions' scenes rather than as a mode of either, because its spine —
 * a turn-by-turn timeline whose shape depends on which pairs are featured —
 * is neither a fixed card fan nor a fixed pair-per-beat track.
 */
export type DeckTeaserProps = DeckTeaserInput & {
  deck?: BonusDeck;
  rewards?: EffectParams[];
  plays?: PlayParams[];
};

export const deckTeaserMetadata: CalculateMetadataFunction<
  DeckTeaserProps
> = async ({ props, abortSignal }) => {
  const parsed = deckTeaserSchema.parse(props);
  const deck = await loadBonusDeck(
    {
      deckSlug: parsed.deckSlug,
      pairs: parsed.pairs,
      featuredCards: parsed.highlights.map(({ title, kicker }) => ({
        title,
        caption: kicker,
      })),
    },
    abortSignal,
  );
  const rewards = parsed.pairs.map((pair, index) =>
    effectParams(pair.effect, deck.pairs[index].back, deck),
  );
  const plays = parsed.highlights.map((highlight, index) =>
    playParams(highlight.effect, deck.featured[index].card, deck, rewards),
  );
  return {
    durationInFrames: teaserTimeline(
      parsed.highlights.length,
      parsed.pairs.map((pair) => pair.featured),
    ).total,
    props: { ...props, ...parsed, deck, rewards, plays },
  };
};

const FlourishLayer: React.FC<{
  palette: Palette;
  timeline: ReturnType<typeof teaserTimeline>;
  particleStyle: DeckTeaserInput["particleStyle"];
}> = ({ palette, timeline, particleStyle }) => {
  const frame = useCurrentFrame();
  return (
    <Flourish
      palette={palette}
      style={particleStyle ?? DEFAULT_PARTICLE_STYLE}
      dim={ambientDim(frame, timeline)}
      bursts={burstsFor(timeline)}
    />
  );
};

export const DeckTeaser: React.FC<DeckTeaserProps> = ({
  highlights,
  pairs,
  stripeColours,
  musicTrack,
  particleStyle,
  backdropColour,
  deck,
  rewards,
  plays,
}) => {
  if (!deck || !rewards || !plays) {
    throw new Error(
      "DeckTeaser: no deck data. This composition must keep its calculateMetadata (deckTeaserMetadata).",
    );
  }
  const palette = paletteFor(deck, backdropColour);
  const stripes: [string, string] = stripeColours ?? [
    palette.accent,
    palette.base,
  ];
  const timeline = teaserTimeline(
    highlights.length,
    pairs.map((pair) => pair.featured),
  );
  // every play happens before the first pair resolves, so the active
  // adventure on a played turn is the first one; the LAST play before it is
  // played in full is the turn that meets its goal
  const first = deck.pairs[0].front;
  const goal = {
    label: `Active ${first.characterName} 1`,
    text: rulesOf(first),
  };
  const playCount = highlights.length - 1;
  const goalsMet = highlights.map(
    (_, index) => pairs[0].featured && index === playCount - 1,
  );

  return (
    <AbsoluteFill style={{ backgroundColor: palette.deep }}>
      <BrandFonts>
        <CircusBackdrop palette={palette} stripes={stripes} />
        <FlourishLayer
          palette={palette}
          timeline={timeline}
          particleStyle={particleStyle}
        />
        <TeaserTrack deck={deck} palette={palette} timeline={timeline} />

        {timeline.segments.map((segment, index) => {
          const { from, duration } = segment;
          switch (segment.kind) {
            case "cold":
              return (
                <Sequence key={index} from={from} durationInFrames={duration}>
                  <SceneFade durationInFrames={duration}>
                    <ColdOpen deck={deck} palette={palette} />
                  </SceneFade>
                </Sequence>
              );
            case "play":
            case "payoff":
              return (
                <Sequence key={index} from={from} durationInFrames={duration}>
                  <Play
                    deck={deck}
                    palette={palette}
                    card={deck.featured[segment.highlight].card}
                    kicker={highlights[segment.highlight].kicker}
                    params={plays[segment.highlight]}
                    duration={duration}
                    goal={
                      segment.kind === "play"
                        ? { ...goal, met: goalsMet[segment.highlight] }
                        : undefined
                    }
                    ownClock={segment.kind === "payoff"}
                  />
                </Sequence>
              );
            case "reward":
              return (
                <Sequence key={index} from={from} durationInFrames={duration}>
                  <RewardBeat
                    deck={deck}
                    palette={palette}
                    stripes={stripes}
                    index={segment.pair}
                    front={deck.pairs[segment.pair].front}
                    back={deck.pairs[segment.pair].back}
                    params={rewards[segment.pair]}
                    caption={pairs[segment.pair].caption}
                    still={pairs[segment.pair].still}
                  />
                </Sequence>
              );
            case "montage":
              return (
                <Sequence key={index} from={from} durationInFrames={duration}>
                  <Montage
                    deck={deck}
                    palette={palette}
                    pairs={segment.pairs}
                    effects={rewards}
                    stills={pairs.map((pair) => pair.still)}
                  />
                </Sequence>
              );
            case "cta":
              return (
                <Sequence key={index} from={from} durationInFrames={duration}>
                  <SceneFade durationInFrames={duration}>
                    <CallToAction deck={deck} palette={palette} />
                  </SceneFade>
                </Sequence>
              );
          }
        })}

        <Wordmark palette={palette} />
        <TeaserAudio
          timeline={timeline}
          plays={plays}
          goalsMet={goalsMet}
          rewards={rewards}
          musicTrack={musicTrack}
        />
      </BrandFonts>
    </AbsoluteFill>
  );
};
