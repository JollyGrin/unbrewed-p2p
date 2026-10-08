import { interpolate } from "remotion";
import {
  clampBoth,
  Cue,
  DEFAULT_MUSIC_TRACK,
  duckedGain,
  MUSIC_BASE,
  MUSIC_FADE_IN,
  MusicBed,
  type MusicTrack,
} from "../shared/audio";
import { CLIP } from "./shots";
import { CUE, type TournamentsTimeline } from "./timeline";

/**
 * Same CC0 chiptune bed and Kenney SFX vocabulary as every other promo. The
 * shape here is a BRACKET: a thock per seat, a swish per round, a slam for
 * the crown; clicks where the footage clicks; a blip per bot post.
 */

const MUSIC_FADE_OUT_AT = 96;
const RISER_RATE = 0.4;
const RISER_LENGTH = Math.round((0.54 * 30) / RISER_RATE);

const musicVolume = (frame: number, timeline: TournamentsTimeline, hits: number[]) => {
  const fadeIn = interpolate(frame, [0, MUSIC_FADE_IN], [0, 1], { ...clampBoth });
  const fadeOut = interpolate(
    frame,
    [timeline.cta.from + MUSIC_FADE_OUT_AT, timeline.cta.from + CUE.ctaSting],
    [1, 0],
    { ...clampBoth },
  );
  return MUSIC_BASE * fadeIn * fadeOut * duckedGain(frame, hits);
};


export const TournamentsAudio: React.FC<{
  timeline: TournamentsTimeline;
  musicTrack?: MusicTrack;
}> = ({ timeline, musicTrack = DEFAULT_MUSIC_TRACK }) => {
  const { hook, create, signup, bracket, async, ready, discord, advance, organizer, cta } = timeline;
  const crown = hook.from + CUE.hookCrown;
  const hits = [crown, ready.from + CUE.readyMerge, cta.from + CUE.ctaCrown, cta.from + CUE.ctaUrl];

  // footage clicks, in beat frames: a scene enters a clip `lead` seconds
  // before a mark and plays it at `rate`, so the mark lands lead*30/rate in
  const c = create.from + Math.round((0.7 * 30) / 1.6);
  const createMarks = CLIP.create.marks;
  const createAt = (m: number) => c + Math.round(((m - createMarks.clickCreate) * 30) / 1.6);
  const startMarks = CLIP.start.marks;
  const startAt = (m: number) => bracket.from + Math.round(((1.1 + m - startMarks.clickStart) * 30) / 1.25);

  return (
    <>
      <MusicBed track={musicTrack} volume={(frame) => musicVolume(frame, timeline, hits)} />

      {/* 1. hook — a tick per seat, a swish per round, the crown slams, rewind */}
      {Array.from({ length: 8 }, (_, i) => (
        <Cue key={i} sfx="stat-tick" from={hook.from + CUE.hookSeats + i * 2} volume={0.28} />
      ))}
      {CUE.hookRounds.map((at) => (
        <Cue key={at} sfx="card-swish" from={hook.from + at} volume={0.45} />
      ))}
      <Cue sfx="riser" from={crown - RISER_LENGTH} playbackRate={RISER_RATE} volume={0.5} />
      <Cue sfx="name-slam" from={crown} volume={0.85} />
      <Cue sfx="slam-sub" from={crown} volume={0.45} />
      <Cue sfx="boost-coin" from={crown + 4} volume={0.45} />
      <Cue sfx="riser" from={hook.from + CUE.hookRewind} playbackRate={1.6} volume={0.4} />
      <Cue sfx="card-thock" from={hook.from + CUE.hookTitle} volume={0.7} />

      {/* 2. create — the clicks the footage makes */}
      <Cue sfx="cta-confirm" from={createAt(createMarks.clickCreate)} volume={0.4} />
      <Cue sfx="reveal-blip" from={createAt(createMarks.clickName)} volume={0.25} />
      <Cue sfx="cta-confirm" from={createAt(createMarks.clickOpen)} volume={0.45} />

      {/* 3. signup — copy link, then a pop per seat */}
      <Cue sfx="cta-confirm" from={signup.from + 24} volume={0.4} />
      {Array.from({ length: 7 }, (_, i) => (
        <Cue key={i} sfx="stat-tick" from={signup.from + 34 + CUE.signupFirst + i * CUE.signupGap} volume={0.32} />
      ))}

      {/* 4. bracket — start, confirm, the cut, the phone */}
      <Cue sfx="cta-confirm" from={startAt(startMarks.clickStart)} volume={0.4} />
      <Cue sfx="cta-confirm" from={startAt(startMarks.confirm)} volume={0.45} />
      <Cue sfx="card-swish" from={bracket.from + CUE.bracketCut} volume={0.4} />
      <Cue sfx="card-swish" from={bracket.from + CUE.bracketPhone} volume={0.5} />

      {/* 5. async — four chips, then the pick */}
      {Array.from({ length: 4 }, (_, i) => (
        <Cue key={i} sfx="card-thock" from={async.from + CUE.asyncChips + i * CUE.asyncChipGap} volume={0.4} />
      ))}
      <Cue sfx="boost-coin" from={async.from + CUE.asyncPick} volume={0.45} />

      {/* 6. ready — two presses, then the room */}
      <Cue sfx="cta-confirm" from={ready.from + Math.round(1.4 * 30)} volume={0.5} />
      <Cue sfx="reveal-blip" from={ready.from + CUE.readyRight} volume={0.35} />
      <Cue sfx="cta-confirm" from={ready.from + CUE.readyRight - 2 + Math.round(1.6 * 30)} volume={0.5} />
      <Cue sfx="riser" from={ready.from + CUE.readyMerge - RISER_LENGTH} playbackRate={RISER_RATE} volume={0.45} />
      <Cue sfx="name-slam" from={ready.from + CUE.readyMerge + 6} volume={0.6} />

      {/* 7. discord — a blip per post, a coin for the ✔ */}
      {CUE.discordPosts.map((at) => (
        <Cue key={at} sfx="reveal-blip" from={discord.from + at} volume={0.4} />
      ))}
      <Cue sfx="boost-coin" from={discord.from + CUE.discordCheck} volume={0.4} />

      {/* 8. advance — the name lands, then the replay */}
      <Cue sfx="card-thock" from={advance.from + Math.round(1.6 * 30)} volume={0.6} />
      <Cue sfx="reveal-blip" from={advance.from + CUE.advanceReplay + 8} volume={0.35} />

      {/* 9. organizer — the ring lands */}
      <Cue sfx="reveal-blip" from={organizer.from + CUE.orgRing} volume={0.4} />

      {/* 10. crown, end card */}
      <Cue sfx="name-slam" from={cta.from + CUE.ctaCrown} volume={0.8} />
      <Cue sfx="slam-sub" from={cta.from + CUE.ctaCrown} volume={0.45} />
      <Cue sfx="cta-confirm" from={cta.from + CUE.ctaUrl} volume={0.5} />
      <Cue sfx="reveal-blip-low" from={cta.from + CUE.ctaLine} volume={0.3} />
      <Cue sfx="jingle-sting" from={cta.from + CUE.ctaSting} volume={0.75} />
    </>
  );
};
