import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  type CalculateMetadataFunction,
} from "remotion";
import { BrandFonts } from "../fonts";
import { Flourish } from "../shared/Flourish";
import { loadDeckPromo, type DeckPromo } from "../shared/deck";
import { CosmeticsAudio } from "./audio";
import { HERO_SELECTION, OPPONENT_SELECTION, STAR_SLOT } from "./cast";
import { ambientDim, burstsFor } from "./flourish";
import { COSMETICS_PALETTE } from "./palette";
import {
  cosmeticsAnnouncementSchema,
  type CosmeticsAnnouncementInput,
} from "./schema";
import { AcrossTheTable } from "./scenes/AcrossTheTable";
import { Earn } from "./scenes/Earn";
import { EndCard } from "./scenes/EndCard";
import { EveryCopy } from "./scenes/EveryCopy";
import { Hook } from "./scenes/Hook";
import { Ladder } from "./scenes/Ladder";
import { TokenClimb } from "./scenes/TokenClimb";
import { cosmeticsTimeline } from "./timeline";
import { Backdrop, SceneFade, Wordmark } from "./ui";

export { cosmeticsTimeline, FPS, totalDuration } from "./timeline";

/**
 * The launch ad for cosmetic rewards (epic #610). Six beats, 39s, fixed:
 * hook · the ladder · how you earn · every copy · the token · across the table
 * · end card.
 *
 * Two things keep it honest rather than pretty:
 *
 *  - every rim on screen is the SHIPPED one. Cards go through `withRimTier` →
 *    `CardRim`; the token band and the pips are `COSMETIC_RIM_PAINTS[tier].ring`
 *    verbatim; prices and thresholds are `lib/account/cosmetics`' own.
 *  - the deck, its art and its card faces come out of the shipped deck JSON
 *    through the same loader the deck promos use, so nothing about Thrall is
 *    typed into this video.
 */
export type CosmeticsAnnouncementProps = CosmeticsAnnouncementInput & {
  /** Loaded in `calculateMetadata` — see the note on `DeckAnnouncement`. */
  hero?: DeckPromo;
  opponent?: DeckPromo;
};

export const cosmeticsAnnouncementMetadata: CalculateMetadataFunction<
  CosmeticsAnnouncementProps
> = async ({ props, abortSignal }) => {
  const parsed = cosmeticsAnnouncementSchema.parse(props);
  const [hero, opponent] = await Promise.all([
    loadDeckPromo(HERO_SELECTION, abortSignal),
    loadDeckPromo(OPPONENT_SELECTION, abortSignal),
  ]);
  return {
    durationInFrames: cosmeticsTimeline().total,
    props: { ...props, ...parsed, hero, opponent },
  };
};

const FlourishLayer: React.FC<{
  timeline: ReturnType<typeof cosmeticsTimeline>;
}> = ({ timeline }) => {
  const frame = useCurrentFrame();
  return (
    <Flourish
      palette={COSMETICS_PALETTE}
      style="motes"
      dim={ambientDim(frame, timeline)}
      bursts={burstsFor(timeline)}
    />
  );
};

export const CosmeticsAnnouncement: React.FC<CosmeticsAnnouncementProps> = ({
  musicTrack,
  hero,
  opponent,
}) => {
  if (!hero || !opponent) {
    throw new Error(
      "CosmeticsAnnouncement: no deck data. This composition must keep its calculateMetadata (cosmeticsAnnouncementMetadata), which loads the decks named in cast.ts out of public/evergreen-decks.",
    );
  }

  const palette = COSMETICS_PALETTE;
  const timeline = cosmeticsTimeline();
  const star = hero.featured[STAR_SLOT].card;
  const theirs = opponent.featured[0].card;

  const beat = (
    key: keyof Omit<typeof timeline, "total">,
    children: React.ReactNode,
    edges?: { fadeIn?: number; fadeOut?: number },
  ) => (
    <Sequence
      key={key}
      name={key}
      from={timeline[key].from}
      durationInFrames={timeline[key].duration}
    >
      <SceneFade durationInFrames={timeline[key].duration} {...edges}>
        {children}
      </SceneFade>
    </Sequence>
  );

  return (
    <AbsoluteFill style={{ backgroundColor: palette.deep }}>
      <BrandFonts>
        <Backdrop palette={palette} />
        <FlourishLayer timeline={timeline} />

        {/* hook → ladder is a MATCH CUT, not a dissolve: the card is in the
            same place at the same size on both sides, so the beats butt up
            against each other and only the copy under it changes. Each scene
            fades its own text; see `Hook`'s `handover` and `Ladder`'s `settle`. */}
        {beat("hook", <Hook card={star} palette={palette} />, { fadeOut: 0 })}
        {beat("ladder", <Ladder card={star} palette={palette} />, {
          fadeIn: 0,
        })}
        {beat("earn", <Earn deck={hero} palette={palette} />)}
        {beat("everyCopy", <EveryCopy deck={hero} palette={palette} />)}
        {beat("token", <TokenClimb deck={hero} palette={palette} />)}
        {beat(
          "table",
          <AcrossTheTable theirs={theirs} yours={star} palette={palette} />,
        )}
        {beat("cta", <EndCard palette={palette} />)}

        {/* the end card says UNBREWED at 200px — the corner mark would only
            be saying it twice, so it hands over before the CTA */}
        <Sequence durationInFrames={timeline.cta.from} name="wordmark">
          <SceneFade durationInFrames={timeline.cta.from}>
            <Wordmark palette={palette} />
          </SceneFade>
        </Sequence>

        <CosmeticsAudio timeline={timeline} musicTrack={musicTrack} />
      </BrandFonts>
    </AbsoluteFill>
  );
};
