/**
 * Tiny WebAudio sound board for Pro matches. Sounds are CC0 clips from
 * kenney.nl (see public/pro/sfx/ATTRIBUTION.md), shipped as mono MP3 (~70KB
 * total) and decoded once into AudioBuffers so playback is instant and clips
 * can overlap freely (an <audio> tag can't replay while still playing).
 *
 * Browsers gate audio behind a user gesture: the context is created suspended
 * and resumed on the first pointer/key event. Every trigger in a match is a
 * click anyway, so in practice the first sound already plays unlocked.
 */

export type SfxName =
  | "flip"
  | "commit"
  | "draw"
  | "hit"
  | "hit-heavy"
  | "blocked"
  | "defeat"
  | "heal"
  | "turn"
  | "victory"
  | "loss"
  // "The Snuff" (issue #346): a candle-snuff / fuse-fizzle "pfft" for the moment
  // a cancel-effects card (Feint, …) foils an opponent's card text.
  | "snuff";

const NAMES: SfxName[] = [
  "flip", "commit", "draw", "hit", "hit-heavy", "blocked",
  "defeat", "heal", "turn", "victory", "loss", "snuff",
];

/** per-clip trim so impacts punch and UI dings stay polite */
const CLIP_GAIN: Partial<Record<SfxName, number>> = {
  flip: 0.9,
  commit: 0.7,
  draw: 0.55,
  "hit-heavy": 1.0,
  blocked: 0.8,
  heal: 0.7,
  turn: 0.5,
  loss: 0.8,
  snuff: 0.85,
};

class SfxEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<SfxName, AudioBuffer>();
  private loadStarted = false;

  /** Create the context and start decoding. Safe to call repeatedly / on SSR. */
  init() {
    if (typeof window === "undefined" || this.ctx) return;
    const AC: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(this.ctx.destination);
    const resume = () => void this.ctx?.resume();
    window.addEventListener("pointerdown", resume, { once: true });
    window.addEventListener("keydown", resume, { once: true });
    void this.loadAll();
  }

  private async loadAll() {
    if (this.loadStarted || !this.ctx) return;
    this.loadStarted = true;
    await Promise.all(
      NAMES.map(async (name) => {
        try {
          const res = await fetch(`/pro/sfx/${name}.mp3`);
          if (!res.ok) return;
          const buf = await this.ctx!.decodeAudioData(await res.arrayBuffer());
          this.buffers.set(name, buf);
        } catch {
          // a missing/undecodable clip just stays silent — never break the game
        }
      })
    );
  }

  /**
   * Fire-and-forget playback. `rate` shifts pitch (1 = as recorded); a small
   * random jitter is always added so repeated hits don't sound machine-stamped.
   */
  play(name: SfxName, opts?: { volume?: number; rate?: number; delayMs?: number }) {
    if (!this.ctx || !this.master) return;
    if (this.ctx.state === "suspended") void this.ctx.resume();
    const buffer = this.buffers.get(name);
    if (!buffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = (opts?.rate ?? 1) * (0.96 + Math.random() * 0.08);
    const gain = this.ctx.createGain();
    gain.gain.value = (CLIP_GAIN[name] ?? 1) * (opts?.volume ?? 1);
    src.connect(gain);
    gain.connect(this.master);
    src.start(this.ctx.currentTime + (opts?.delayMs ?? 0) / 1000);
  }
}

/** module singleton — one AudioContext per tab */
export const sfx = new SfxEngine();
