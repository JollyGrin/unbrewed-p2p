import type { Voice } from "./director";
import type { TakeGroup } from "./events";
import { SOUND_TAKES } from "./manifest";

/**
 * The Web Audio half that does not care which context it runs in: decoding
 * the pack and wiring one voice. The live engine (engine.ts) uses it on the
 * page's AudioContext; the measurement and audition pages use the very same
 * code on an OfflineAudioContext, so what is measured is what plays.
 */

export type DecodedTake = {
  buffer: AudioBuffer;
  /** Seconds of codec padding before the sound, skipped on playback. */
  lead: number;
};

export type TakeBank = Partial<Record<TakeGroup, DecodedTake[]>>;

/**
 * Slider position (0..1) to master gain. Squared so the low end of the slider
 * is usable, and capped at 0.7 so a few overlapping sounds at full volume
 * still have headroom.
 */
export const volumeToGain = (volume: number): number =>
  0.7 * Math.min(1, Math.max(0, volume)) ** 2;

// Safari before 14.1 only has the callback form.
const decode = (ctx: BaseAudioContext, data: ArrayBuffer) =>
  new Promise<AudioBuffer>((resolve, reject) => {
    const pending = ctx.decodeAudioData(data, resolve, reject);
    if (pending && typeof pending.catch === "function") pending.catch(reject);
  });

/**
 * MP3 decoders prepend a browser-dependent stretch of silence. Find where the
 * sound really starts so every browser plays it with the same (no) latency.
 */
const leadOf = (buffer: AudioBuffer): number => {
  const data = buffer.getChannelData(0);
  const limit = Math.min(data.length, Math.floor(buffer.sampleRate * 0.08));
  for (let i = 0; i < limit; i++) {
    if (Math.abs(data[i]) > 0.003) {
      return Math.max(0, i / buffer.sampleRate - 0.002);
    }
  }
  return 0;
};

/** Decode every take of the pack. A take that fails to decode is left out. */
export const decodePack = async (
  ctx: BaseAudioContext,
  pack: ArrayBuffer,
): Promise<TakeBank> => {
  const bank: TakeBank = {};
  await Promise.all(
    (Object.keys(SOUND_TAKES) as TakeGroup[]).map(async (group) => {
      const decoded = await Promise.all(
        SOUND_TAKES[group].map(([offset, length]) =>
          // decodeAudioData detaches its input, so each take gets its own copy.
          decode(ctx, pack.slice(offset, offset + length)).then(
            (buffer): DecodedTake => ({ buffer, lead: leadOf(buffer) }),
            () => undefined,
          ),
        ),
      );
      bank[group] = decoded.filter((t): t is DecodedTake => !!t);
    }),
  );
  return bank;
};

/** Wire and schedule one voice: take → low-pass → level → `destination`. */
export const connectVoice = (
  ctx: BaseAudioContext,
  destination: AudioNode,
  take: DecodedTake,
  voice: Pick<Voice, "rate" | "gain" | "lowpassHz">,
  when: number,
): AudioBufferSourceNode => {
  const source = ctx.createBufferSource();
  source.buffer = take.buffer;
  source.playbackRate.value = voice.rate;
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = voice.lowpassHz;
  lowpass.Q.value = -3; // dB: no resonant bump at the cutoff
  const level = ctx.createGain();
  level.gain.value = voice.gain;
  source.connect(lowpass);
  lowpass.connect(level);
  level.connect(destination);
  source.onended = () => level.disconnect();
  source.start(when, take.lead);
  return source;
};
