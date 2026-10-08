/**
 * The tournaments ad's frame budget, in one place — same contract as the
 * cosmetics, tabletop and stats ads: the Sequences (`index.tsx`) and the audio
 * cues (`audio.tsx`) are both built from this, so retiming a beat retimes its
 * sound.
 *
 * A FIXED storyboard ("The bracket runs itself", approved 2026-10-08): one
 * video about one shipped feature. 1200 frames = 40.0s at 30fps.
 */

export const FPS = 30;

export type Beat = { from: number; duration: number };

/** Beat lengths, in order. The order here IS the order on screen. */
export const BEATS = [
  /** a whole bracket in fast-forward to a crown, then a rewind */
  ["hook", 90],
  /** /tournaments → Create → Weekend bracket → name → Open signup */
  ["create", 120],
  /** the seats fill, one still per join */
  ["signup", 90],
  /** Start bracket, then the live bracket, then the phone */
  ["bracket", 150],
  /** one match card and its window */
  ["async", 105],
  /** split: ready now, join later, one locked room */
  ["ready", 180],
  /** the bot's thread for that match */
  ["discord", 135],
  /** the result lands on the bracket by itself */
  ["advance", 120],
  /** the organizer's controls */
  ["organizer", 75],
  /** the crown lands for real, then the end card */
  ["cta", 135],
] as const satisfies readonly (readonly [string, number])[];

export type BeatName = (typeof BEATS)[number][0];

export type TournamentsTimeline = Record<BeatName, Beat> & { total: number };

export const tournamentsTimeline = (): TournamentsTimeline => {
  let at = 0;
  const beats = {} as Record<BeatName, Beat>;
  for (const [name, duration] of BEATS) {
    beats[name] = { from: at, duration };
    at += duration;
  }
  return { ...beats, total: at };
};

export const totalDuration = () => tournamentsTimeline().total;

/** Beat-internal cue frames: a cue is `beat.from + CUE.<name>`. */
export const CUE = {
  /** Hook: the eight names snap into their seats, 2f apart */
  hookSeats: 2,
  /** Hook: winners fire through each round */
  hookRounds: [16, 30, 42] as readonly number[],
  /** Hook: the crown slams onto the champion */
  hookCrown: 52,
  /** Hook: the rewind zips everything back to empty seats */
  hookRewind: 66,
  /** Hook: "Tournaments are here." */
  hookTitle: 74,

  /** Create: the clip's clicks, in beat frames (see shots.ts) */
  createLine: 10,

  /** Signup: first seat fills, then one every `signupGap` frames */
  signupFirst: 6,
  signupGap: 8,
  signupLine: 8,

  /** Bracket: the start clip's click; the cut to the live plate; the phone */
  bracketLine: 50,
  bracketCut: 44,
  bracketPhone: 100,

  /** Async: the card settles, the chips deal, 48h lights */
  asyncCard: 4,
  asyncChips: 20,
  asyncChipGap: 6,
  asyncPick: 52,
  asyncLine: 10,

  /** Ready: the right half (the later player) wakes, then both merge to the room */
  readyLine: 8,
  readyRight: 70,
  readyMerge: 132,
  readyLine2: 136,

  /** Discord: the three posts and the thread's ✔ */
  discordPosts: [10, 44, 82] as readonly number[],
  discordCheck: 104,
  discordLine: 12,

  /** Advance: the line, and the replay chip */
  advanceLine: 8,
  advanceReplay: 84,

  /** Organizer: the line, then the ring on the controls */
  orgLine: 6,
  orgRing: 18,

  /** CTA: the crown lands, then the card */
  ctaCrown: 10,
  ctaCard: 58,
  ctaMark: 60,
  ctaUrl: 74,
  ctaLine: 90,
  ctaSting: 104,
} as const;
