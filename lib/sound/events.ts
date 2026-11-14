/**
 * The table's sound events and how each one is mixed.
 *
 * Every take in the pack is levelled to the same loudness (see
 * public/sounds/table/SOURCES.md), so `gain` here is the whole mix: who is
 * louder than whom. `rate` and `lowpassHz` set the character (slower and
 * duller reads as wood or felt, faster and brighter as paper); the `*Jitter`
 * fields are the per-play variation range around them.
 */
export type SoundEventConfig = {
  /** Which takes to play: an entry of SOUND_TAKES. */
  takes: TakeGroup;
  /** Mix level, 0..1, before the master volume. */
  gain: number;
  /** Base playback rate (pitch and speed together). */
  rate: number;
  /** Per-play rate spread: a play lands in rate * (1 ± rateJitter). */
  rateJitter: number;
  /** Low-pass cutoff in Hz; jittered ±12% per play. */
  lowpassHz: number;
  /** Plays of this event closer together than this are dropped. */
  minGapMs: number;
  /** Gap between the plays of one burst, e.g. "drew 3 cards". */
  burstGapMs: number;
};

export type TakeGroup =
  | "draw"
  | "place"
  | "discard"
  | "flip"
  | "shuffle"
  | "tokenDown"
  | "tokenUp"
  | "hp"
  | "die"
  | "dice";

const paper = { rateJitter: 0.07, minGapMs: 60, burstGapMs: 95 };
const piece = { rateJitter: 0.08, minGapMs: 70, burstGapMs: 80 };

export const SOUND_EVENTS = {
  /** A card arrives in the hand (from the deck, the discard or the table). */
  draw: { takes: "draw", gain: 0.75, rate: 1, lowpassHz: 6000, ...paper },
  /** A card lands on the table or on the deck. */
  place: { takes: "place", gain: 0.8, rate: 1, lowpassHz: 5500, ...paper },
  /** A card on the table is picked up to be moved. */
  cardUp: { takes: "draw", gain: 0.4, rate: 1.12, lowpassHz: 5000, ...paper },
  /** A card goes to the discard pile. */
  discard: { takes: "discard", gain: 0.7, rate: 1, lowpassHz: 5500, ...paper },
  /** A card or a two-faced piece is turned over. */
  flip: { takes: "flip", gain: 0.7, rate: 1.08, lowpassHz: 6500, ...paper },
  /** The deck is shuffled. */
  shuffle: {
    takes: "shuffle",
    gain: 0.6,
    rate: 1,
    rateJitter: 0.04,
    lowpassHz: 6000,
    minGapMs: 600,
    burstGapMs: 0,
  },
  /** A piece is put down on the board. */
  tokenDown: { takes: "tokenDown", gain: 0.75, rate: 0.84, lowpassHz: 3600, ...piece },
  /** A piece is picked up off the board. */
  tokenUp: { takes: "tokenUp", gain: 0.45, rate: 0.9, lowpassHz: 3600, ...piece },
  /** A health dial or counter moves one step. */
  hp: {
    takes: "hp",
    gain: 0.5,
    rate: 0.92,
    rateJitter: 0.05,
    lowpassHz: 4200,
    minGapMs: 40,
    burstGapMs: 60,
  },
  /** One die is thrown and comes to rest. */
  die: { takes: "die", gain: 0.7, rate: 0.96, rateJitter: 0.06, lowpassHz: 5000, minGapMs: 250, burstGapMs: 70 },
  /** Several dice are thrown and come to rest. */
  dice: { takes: "dice", gain: 0.8, rate: 0.96, rateJitter: 0.06, lowpassHz: 5000, minGapMs: 250, burstGapMs: 70 },
} as const satisfies Record<string, SoundEventConfig>;

export type SoundEvent = keyof typeof SOUND_EVENTS;

export const SOUND_EVENT_NAMES = Object.keys(SOUND_EVENTS) as SoundEvent[];
