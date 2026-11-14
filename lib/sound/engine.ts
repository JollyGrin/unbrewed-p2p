import type { Voice } from "./director";
import type { TakeGroup } from "./events";
import { TakeBank, connectVoice, decodePack, volumeToGain } from "./graph";
import { SOUND_PACK_URL } from "./manifest";
import { getSoundPrefs, subscribeSoundPrefs } from "./settings";

/**
 * The live audio backend. Nothing here runs at import time (the pages are
 * statically exported), and nothing here can hold up the table:
 *
 * - Browsers only let audio start from a user gesture, so the AudioContext is
 *   created on the first pointer or key press after the table mounts, and the
 *   sound pack (one ~90 KB file) is fetched then, never before.
 * - A sound that cannot play right now (pack not decoded yet, context
 *   suspended, tab hidden, muted) is dropped, not queued: a late sound is
 *   worse than none.
 * - While muted nothing is created or fetched at all.
 */

type Engine = {
  ctx: AudioContext;
  master: GainNode;
};

let engine: Engine | undefined;
let bank: TakeBank = {};
let loading: Promise<void> | undefined;
let lastLoadFailure = 0;
const RETRY_LOAD_AFTER_MS = 30_000;
/** Level changes glide over a few ms so mute and the slider never click. */
const GLIDE_S = 0.012;

const contextCtor = (): typeof AudioContext | undefined =>
  typeof window === "undefined"
    ? undefined
    : (window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext);

const applyLevel = () => {
  if (!engine) return;
  const { muted, volume } = getSoundPrefs();
  const { ctx, master } = engine;
  // Muting silences what is already ringing, not just what comes next.
  master.gain.setTargetAtTime(
    muted ? 0 : volumeToGain(volume),
    ctx.currentTime,
    GLIDE_S,
  );
};

const ensureEngine = (): Engine | undefined => {
  if (engine) return engine;
  const Ctor = contextCtor();
  if (!Ctor) return undefined;
  try {
    const ctx = new Ctor({ latencyHint: "interactive" });
    const master = ctx.createGain();
    const { muted, volume } = getSoundPrefs();
    master.gain.value = muted ? 0 : volumeToGain(volume);
    master.connect(ctx.destination);
    engine = { ctx, master };
  } catch {
    // No audio device, or the browser refused: the table stays silent.
    return undefined;
  }
  return engine;
};

const loadPack = (ctx: AudioContext) => {
  if (loading) return;
  if (Date.now() - lastLoadFailure < RETRY_LOAD_AFTER_MS) return;
  loading = fetch(SOUND_PACK_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`sound pack: HTTP ${res.status}`);
      return res.arrayBuffer();
    })
    .then((pack) => decodePack(ctx, pack))
    .then((decoded) => {
      bank = decoded;
    })
    .catch(() => {
      // Offline or blocked: stay silent and try again on a later gesture.
      lastLoadFailure = Date.now();
      loading = undefined;
    });
};

/**
 * Bring audio up (or back up). Must run inside a user gesture the first time,
 * and again whenever the browser suspended or interrupted the context (iOS
 * does on a phone call, on locking the screen, on switching apps).
 */
const wake = () => {
  if (getSoundPrefs().muted) return;
  const e = ensureEngine();
  if (!e) return;
  if (e.ctx.state !== "running") void e.ctx.resume().catch(() => {});
  loadPack(e.ctx);
};

const onVisibility = () => {
  if (!engine) return;
  if (document.hidden) {
    // A hidden tab makes no sound and holds no audio device.
    void engine.ctx.suspend().catch(() => {});
  } else if (!getSoundPrefs().muted) {
    // May be refused without a gesture (Safari); the next press wakes it.
    void engine.ctx.resume().catch(() => {});
  }
};

const onPrefs = () => {
  if (!getSoundPrefs().muted) {
    // The unmute click is itself a gesture, so audio can start right here.
    wake();
  } else if (engine) {
    const { ctx } = engine;
    // Let the glide to silence finish, then release the audio device.
    setTimeout(() => {
      if (getSoundPrefs().muted) void ctx.suspend().catch(() => {});
    }, 120);
  }
  applyLevel();
};

const GESTURES = ["pointerdown", "pointerup", "touchend", "keydown"] as const;
let armed = 0;
let unsubscribePrefs: (() => void) | undefined;

/**
 * Start listening for the gesture that unlocks audio. Call from an effect on
 * the table; returns the cleanup. Safe to call more than once.
 */
export const armSoundEngine = (): (() => void) => {
  if (typeof window === "undefined") return () => {};
  if (armed++ === 0) {
    const opts = { capture: true, passive: true } as const;
    GESTURES.forEach((type) => window.addEventListener(type, wake, opts));
    document.addEventListener("visibilitychange", onVisibility);
    unsubscribePrefs = subscribeSoundPrefs(onPrefs);
  }
  return () => {
    if (--armed > 0) return;
    GESTURES.forEach((type) =>
      window.removeEventListener(type, wake, { capture: true }),
    );
    document.removeEventListener("visibilitychange", onVisibility);
    unsubscribePrefs?.();
    // Leaving the table: stop holding the audio device. Coming back resumes.
    if (engine) void engine.ctx.suspend().catch(() => {});
  };
};

/** Whether a sound asked for now would be heard. */
export const engineReady = (): boolean =>
  !!engine &&
  engine.ctx.state === "running" &&
  typeof document !== "undefined" &&
  !document.hidden;

export const takeCount = (group: TakeGroup): number => bank[group]?.length ?? 0;

export const playVoice = (voice: Voice) => {
  if (!engine || !engineReady()) return;
  const take = bank[voice.takes]?.[voice.take];
  if (!take) return;
  try {
    const { ctx, master } = engine;
    connectVoice(ctx, master, take, voice, ctx.currentTime + voice.delayMs / 1000);
  } catch {
    // A sound must never break the action that asked for it.
  }
};
