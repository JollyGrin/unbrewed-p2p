import { Fragment } from "react";
import { interpolate } from "remotion";
import { RewardBeatCues } from "../BonusShowcase/audio";
import type { EffectParams } from "../BonusShowcase/effects";
import { CUE as DECK_CUE } from "../DeckAnnouncement/timeline";
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
import { teaserCues } from "./flourish";
import { playCues, type PlayParams } from "./plays";
import { FLASH, FLASH_CUE, PLAY_CUE, type TeaserTimeline } from "./timeline";

/**
 * The teaser's sound, from the committed CC0 files only (public/audio/
 * LICENSES.md). The cold open and the CTA borrow DeckAnnouncement's cue
 * frames because they ARE its scenes; reward beats mount the showcase's own
 * `RewardBeatCues`; plays, flashes and the payoff fire on their scene frames.
 */
const RISER_RATE = 0.6;
const RISER_LENGTH = Math.round((0.54 * 30) / RISER_RATE);

export const TeaserAudio: React.FC<{
  timeline: TeaserTimeline;
  plays: PlayParams[];
  goalsMet: boolean[];
  rewards: EffectParams[];
  musicTrack?: MusicTrack;
}> = ({
  timeline,
  plays,
  goalsMet,
  rewards,
  musicTrack = DEFAULT_MUSIC_TRACK,
}) => {
  const cues = teaserCues(timeline);
  const cta = timeline.segments[timeline.segments.length - 1];
  const hits = [
    cues.nameSlam,
    ...cues.stamps,
    cues.hit,
    cta.from + DECK_CUE.ctaOutro,
  ];
  const volume = (frame: number) =>
    MUSIC_BASE *
    interpolate(frame, [0, MUSIC_FADE_IN], [0, 1], clampBoth) *
    interpolate(
      frame,
      [cta.from + 44, cta.from + DECK_CUE.ctaOutro],
      [1, 0],
      clampBoth,
    ) *
    duckedGain(frame, hits);

  return (
    <>
      <MusicBed track={musicTrack} volume={volume} />
      {timeline.segments.map((segment, index) => {
        const { from } = segment;
        switch (segment.kind) {
          case "cold":
            return (
              <Fragment key={index}>
                <Cue
                  sfx="riser"
                  from={cues.nameSlam - RISER_LENGTH}
                  playbackRate={RISER_RATE}
                  volume={0.85}
                />
                <Cue sfx="name-slam" from={cues.nameSlam} volume={0.9} />
                <Cue sfx="slam-sub" from={cues.nameSlam} volume={0.45} />
              </Fragment>
            );
          case "play":
          case "payoff": {
            const params = plays[segment.highlight];
            const offset = segment.kind === "play" ? PLAY_CUE.effect : 0;
            return (
              <Fragment key={index}>
                <Cue
                  sfx="card-swish"
                  from={from + PLAY_CUE.cardIn}
                  volume={0.5}
                />
                <Cue
                  sfx="card-thock"
                  from={from + PLAY_CUE.cardLand}
                  volume={0.75}
                />
                {playCues(params).map((cue, n) => (
                  <Cue
                    key={n}
                    sfx={cue.sfx}
                    from={from + offset + cue.at}
                    volume={cue.volume}
                    playbackRate={cue.playbackRate}
                  />
                ))}
                {segment.kind === "play" && goalsMet[segment.highlight] ? (
                  <Cue
                    sfx="cta-confirm"
                    from={from + PLAY_CUE.goalTick}
                    volume={0.4}
                  />
                ) : null}
              </Fragment>
            );
          }
          case "reward":
            return (
              <RewardBeatCues
                key={index}
                from={from}
                effect={rewards[segment.pair]}
              />
            );
          case "montage":
            return (
              <Fragment key={index}>
                {segment.pairs.map((_, n) => (
                  <Fragment key={n}>
                    <Cue
                      sfx="card-swish"
                      from={from + n * FLASH + FLASH_CUE.rise}
                      volume={0.4}
                    />
                    <Cue
                      sfx="boost-coin"
                      from={from + n * FLASH + FLASH_CUE.flipLand}
                      volume={0.4}
                    />
                    <Cue
                      sfx="reveal-blip"
                      from={from + n * FLASH + FLASH_CUE.label}
                      volume={0.3}
                    />
                  </Fragment>
                ))}
              </Fragment>
            );
          // the slam, its sub and the sting stack inside 5 frames; at the deck
          // promo's levels they clip (measured 1.001 peak), so they sit lower here
          case "cta":
            return (
              <Fragment key={index}>
                {DECK_CUE.statChips.map((delay) => (
                  <Cue
                    key={delay}
                    sfx="stat-tick"
                    from={from + delay}
                    volume={0.5}
                  />
                ))}
                <Cue
                  sfx="cta-confirm"
                  from={from + DECK_CUE.ctaUrl}
                  volume={0.45}
                />
                <Cue
                  sfx="name-slam"
                  from={from + DECK_CUE.ctaOutro}
                  volume={0.65}
                />
                <Cue
                  sfx="slam-sub"
                  from={from + DECK_CUE.ctaOutro}
                  volume={0.35}
                />
                <Cue
                  sfx="jingle-sting"
                  from={from + DECK_CUE.ctaSting}
                  volume={0.6}
                />
              </Fragment>
            );
        }
      })}
    </>
  );
};
