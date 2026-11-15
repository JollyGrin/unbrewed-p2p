/**
 * The teaser's frame budget. Its shape depends on the props — how many
 * highlights, which pairs are featured — so it is built, not fixed. The
 * Sequences, the audio, the bursts and the persistent track all read this.
 * Pure — `scripts/check-flourish.mjs` imports it.
 */
import { BEAT, CUE as BEAT_CUE } from "../BonusShowcase/timeline";

export const FPS = 30;

/** DeckAnnouncement's ColdOpen, cut short: the name has landed by ~74. */
export const COLD = 110;
/** One main-deck card played. */
export const PLAY = 110;
/** One non-featured pair flashed in the montage. */
export const FLASH = 54;
const MONTAGE_TAIL = 6;
export const PAYOFF = 140;
/** DeckAnnouncement's CallToAction runs its outro on 118 and sting on 123. */
export const CTA = 180;

export type Segment =
  | { kind: "cold"; from: number; duration: number }
  | { kind: "play"; from: number; duration: number; highlight: number }
  | { kind: "reward"; from: number; duration: number; pair: number }
  | { kind: "montage"; from: number; duration: number; pairs: number[] }
  | { kind: "payoff"; from: number; duration: number; highlight: number }
  | { kind: "cta"; from: number; duration: number };

/** Per side-deck card: when it is off the track, and when it turns over. */
export type SlotTiming = {
  /** [from, to) — the card is out (its beat or flash draws it) */
  out: [number, number];
  /** from this frame on, the track shows its back */
  flippedAt: number;
};

export type TeaserTimeline = {
  segments: Segment[];
  slots: SlotTiming[];
  /** the track deals in on the first play */
  dealAt: number;
  total: number;
};

/** Montage-internal frames, per flash. */
export const FLASH_CUE = {
  rise: 0,
  flip: 8,
  flipLand: 18,
  label: 14,
  home: 42,
};

/** Play- and payoff-internal frames. */
export const PLAY_CUE = { cardIn: 0, cardLand: 14, effect: 18, goalTick: 62 };
export const PAYOFF_CUE = {
  cardIn: 0,
  cardLand: 14,
  climbFrom: 22,
  climbGap: 8,
  beamFrom: 72,
  hit: 90,
};

export const teaserTimeline = (
  highlightCount: number,
  featured: boolean[],
): TeaserTimeline => {
  const segments: Segment[] = [];
  const slots: SlotTiming[] = featured.map(() => ({
    out: [0, 0],
    flippedAt: Infinity,
  }));
  let at = 0;
  const push = (segment: Segment) => {
    segments.push(segment);
    at += segment.duration;
  };

  push({ kind: "cold", from: at, duration: COLD });
  for (let highlight = 0; highlight < highlightCount - 1; highlight++) {
    push({ kind: "play", from: at, duration: PLAY, highlight });
  }
  const dealAt = segments[1]?.from ?? COLD;

  let index = 0;
  while (index < featured.length) {
    if (featured[index]) {
      slots[index] = { out: [at, at + BEAT], flippedAt: at + BEAT_CUE.flip };
      push({ kind: "reward", from: at, duration: BEAT, pair: index });
      index++;
      continue;
    }
    const run: number[] = [];
    while (index < featured.length && !featured[index]) run.push(index++);
    run.forEach((pair, n) => {
      const start = at + n * FLASH;
      slots[pair] = {
        out: [start, start + FLASH],
        flippedAt: start + FLASH_CUE.flip,
      };
    });
    push({
      kind: "montage",
      from: at,
      duration: run.length * FLASH + MONTAGE_TAIL,
      pairs: run,
    });
  }

  push({
    kind: "payoff",
    from: at,
    duration: PAYOFF,
    highlight: highlightCount - 1,
  });
  push({ kind: "cta", from: at, duration: CTA });
  return { segments, slots, dealAt, total: at };
};
