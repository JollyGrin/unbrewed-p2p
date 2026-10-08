import {
  AbsoluteFill,
  interpolate,
  Sequence,
  useCurrentFrame,
  type CalculateMetadataFunction,
} from "remotion";
import { BrandFonts } from "../fonts";
import { Flourish } from "../shared/Flourish";
import { curve } from "../shared/particles";
import { TournamentsAudio } from "./audio";
import { TOURNAMENTS_PALETTE } from "./palette";
import {
  tournamentsAnnouncementSchema,
  type TournamentsAnnouncementInput,
} from "./schema";
import { Advance } from "./scenes/Advance";
import { Async } from "./scenes/Async";
import { Bracket } from "./scenes/Bracket";
import { Champion, EndCard } from "./scenes/Champion";
import { Create } from "./scenes/Create";
import { Discord } from "./scenes/Discord";
import { Hook } from "./scenes/Hook";
import { Organizer } from "./scenes/Organizer";
import { Ready } from "./scenes/Ready";
import { Signup } from "./scenes/Signup";
import { CUE, tournamentsTimeline, type TournamentsTimeline } from "./timeline";
import { Backdrop, clamp, SceneFade } from "./ui";

export { FPS, totalDuration, tournamentsTimeline } from "./timeline";

const DEFAULT_URL = "unbrewed.xyz/tournaments";

/**
 * The launch ad for Tournaments (telemetry #81, engine #763, api #117, p2p
 * #1264; shipped 2026-10-08). Ten beats, 40s, fixed — "The bracket runs
 * itself": the hook races a whole bracket to a crown and rewinds, then the ad
 * shows how it got there: create · signup · bracket · async · ready check ·
 * Discord · the result reporting itself · organizer · champion and end card.
 *
 * What keeps it honest: every page on screen is a capture of the running
 * build (a local stack on origin/main, dev-login accounts with invented
 * handles), every game in the bracket was really played to a result, and the
 * Discord thread is the bot's own dry-run output. Drawn: the hook, the window
 * chips, the camera, the copy. See shots.ts and cast.ts.
 */
export type TournamentsAnnouncementProps = TournamentsAnnouncementInput;

export const tournamentsAnnouncementMetadata: CalculateMetadataFunction<
  TournamentsAnnouncementProps
> = async ({ props }) => ({
  durationInFrames: tournamentsTimeline().total,
  props: { ...props, ...tournamentsAnnouncementSchema.parse(props) },
});

/** The motes only show where the backdrop does: hook, async, Discord, end card. */
const ambientDim = (frame: number, timeline: TournamentsTimeline) =>
  curve(frame, [
    [timeline.hook.from, 0.6],
    [timeline.create.from, 0],
    [timeline.discord.from, 0.4],
    [timeline.advance.from, 0],
    [timeline.cta.from + CUE.ctaCard, 0.7],
    [timeline.cta.from + CUE.ctaSting, 1],
  ]);

const Stage: React.FC<{ timeline: TournamentsTimeline }> = ({ timeline }) => {
  const frame = useCurrentFrame();
  return (
    <>
      <Backdrop palette={TOURNAMENTS_PALETTE} />
      <Flourish
        palette={TOURNAMENTS_PALETTE}
        style="motes"
        dim={ambientDim(frame, timeline)}
        bursts={[]}
      />
    </>
  );
};

/** The cta beat: the champion card, then a dip to the end card. */
const Finale: React.FC<{ url: string }> = ({ url }) => {
  const frame = useCurrentFrame();
  const palette = TOURNAMENTS_PALETTE;
  const out = interpolate(frame, [CUE.ctaCard - 10, CUE.ctaCard], [1, 0], clamp);
  return (
    <AbsoluteFill>
      {out > 0 ? (
        <AbsoluteFill style={{ opacity: out }}>
          <Champion palette={palette} />
        </AbsoluteFill>
      ) : null}
      <EndCard palette={palette} url={url} />
    </AbsoluteFill>
  );
};

export const TournamentsAnnouncement: React.FC<
  TournamentsAnnouncementProps
> = ({ musicTrack, url = DEFAULT_URL }) => {
  const palette = TOURNAMENTS_PALETTE;
  const timeline = tournamentsTimeline();

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
        <Stage timeline={timeline} />

        {beat("hook", <Hook palette={palette} />, { fadeIn: 0, fadeOut: 6 })}
        {beat("create", <Create palette={palette} />)}
        {beat("signup", <Signup palette={palette} />)}
        {beat("bracket", <Bracket palette={palette} />)}
        {beat("async", <Async palette={palette} />)}
        {beat("ready", <Ready palette={palette} />)}
        {beat("discord", <Discord palette={palette} />)}
        {beat("advance", <Advance palette={palette} />)}
        {beat("organizer", <Organizer palette={palette} />)}
        {beat("cta", <Finale url={url} />, { fadeOut: 0 })}

        <TournamentsAudio timeline={timeline} musicTrack={musicTrack} />
      </BrandFonts>
    </AbsoluteFill>
  );
};
