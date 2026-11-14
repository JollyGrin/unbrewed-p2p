import { SOUND_EVENTS, SoundEvent, TakeGroup } from "./events";

/**
 * Decides what is actually heard for a `playSound(event)` call: which take,
 * at what pitch, level and delay, or nothing at all (muted, too soon after
 * the last one, too much already playing). No audio in here, so it runs
 * (and is tested) without a browser; the backend only plays what it is told.
 */

/** One sound the backend should play. */
export type Voice = {
  event: SoundEvent;
  takes: TakeGroup;
  /** Index into the take group. */
  take: number;
  /** Playback rate. */
  rate: number;
  /** Level before the master volume. */
  gain: number;
  lowpassHz: number;
  /** Start this long after the call. */
  delayMs: number;
};

export type PlayOptions = {
  /** Play a short burst (drew 3 cards). Capped at {@link MAX_BURST}. */
  count?: number;
  /** Level multiplier, e.g. {@link REMOTE_GAIN} for another player's action. */
  gain?: number;
  /** Rate multiplier, e.g. a touch lower for damage than for healing. */
  pitch?: number;
};

export type DirectorDeps = {
  /** How many takes a group holds. */
  takeCount: (takes: TakeGroup) => number;
  isMuted: () => boolean;
  /** Uniform in [0, 1). */
  rng?: () => number;
  /** Milliseconds, monotonic. */
  now?: () => number;
};

/** A burst never plays more than this many sounds, however many cards moved. */
export const MAX_BURST = 3;
/** Other players' actions play at this fraction of your own. */
export const REMOTE_GAIN = 0.45;
/** At most this many sounds may start within {@link WINDOW_MS}. */
export const MAX_IN_WINDOW = 6;
export const WINDOW_MS = 500;
/** A repeat of the same event inside this window plays a little quieter. */
export const FATIGUE_MS = 450;
const FATIGUE_STEP = 0.86;
const FATIGUE_FLOOR = 0.55;
const GAIN_JITTER = 0.12;
const LOWPASS_JITTER = 0.12;
/** A lone sound starts within this many ms, so nothing is ever grid-locked. */
const START_JITTER_MS = 10;
const BURST_JITTER = 0.35;

export const createDirector = ({
  takeCount,
  isMuted,
  rng = Math.random,
  now = () => performance.now(),
}: DirectorDeps) => {
  // Recently played takes per group, newest last.
  const history = new Map<TakeGroup, number[]>();
  // Start times of recent voices (all events) and of each event's last calls.
  let recent: number[] = [];
  const lastCalls = new Map<SoundEvent, number[]>();
  const lastPlayed = new Map<SoundEvent, number>();

  const spread = (amount: number) => 1 + (rng() * 2 - 1) * amount;

  /** Never the take that just played; with four or more, not the one before either. */
  const pickTake = (takes: TakeGroup): number => {
    const count = takeCount(takes);
    if (count <= 1) return 0;
    const past = history.get(takes) ?? [];
    const banned = past.slice(count >= 4 ? -2 : -1);
    const free: number[] = [];
    for (let i = 0; i < count; i++) if (!banned.includes(i)) free.push(i);
    const take = free[Math.min(free.length - 1, Math.floor(rng() * free.length))];
    history.set(takes, [...past, take].slice(-2));
    return take;
  };

  const play = (event: SoundEvent, opts: PlayOptions = {}): Voice[] => {
    if (isMuted()) return [];
    const cfg = SOUND_EVENTS[event];
    if (takeCount(cfg.takes) === 0) return [];
    const t = now();

    const last = lastPlayed.get(event);
    if (last !== undefined && t - last < cfg.minGapMs) return [];
    const calls = (lastCalls.get(event) ?? []).filter((c) => t - c < FATIGUE_MS);

    recent = recent.filter((s) => s > t - WINDOW_MS);
    const room = MAX_IN_WINDOW - recent.length;
    if (room <= 0) return [];

    const wanted = Math.max(1, Math.min(MAX_BURST, Math.floor(opts.count ?? 1)));
    const count = Math.min(wanted, room);
    const fatigue = Math.max(FATIGUE_FLOOR, FATIGUE_STEP ** calls.length);
    lastCalls.set(event, [...calls, t]);
    lastPlayed.set(event, t);

    const voices: Voice[] = [];
    let delayMs = rng() * START_JITTER_MS;
    for (let i = 0; i < count; i++) {
      if (i > 0) delayMs += cfg.burstGapMs * spread(BURST_JITTER);
      voices.push({
        event,
        takes: cfg.takes,
        take: pickTake(cfg.takes),
        rate: cfg.rate * spread(cfg.rateJitter) * (opts.pitch ?? 1),
        // Later sounds of a burst sit back a little, like cards landing on cards.
        gain: cfg.gain * spread(GAIN_JITTER) * fatigue * (opts.gain ?? 1) * 0.88 ** i,
        lowpassHz: cfg.lowpassHz * spread(LOWPASS_JITTER),
        delayMs,
      });
      recent.push(t + delayMs);
    }
    return voices;
  };

  return { play };
};

export type Director = ReturnType<typeof createDirector>;
