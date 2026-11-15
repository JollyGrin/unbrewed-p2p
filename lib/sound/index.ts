import { PlayOptions, createDirector } from "./director";
import { engineReady, playVoice, takeCount } from "./engine";
import type { SoundEvent } from "./events";
import { getSoundPrefs } from "./settings";

/**
 * Table sounds. The whole public surface is here:
 *
 *   playSound("draw");                 // one soft card slide
 *   playSound("draw", { count: 3 });   // a short, staggered burst
 *
 * Calling it is always safe: on the server, before the player has touched the
 * page, while muted, in a hidden tab or before the pack has loaded it simply
 * does nothing. See director.ts for how repeats are varied and rate-limited,
 * engine.ts for the browser rules, components/Game/Sound for the table wiring.
 */
export type { SoundEvent } from "./events";
export type { PlayOptions } from "./director";
export { REMOTE_GAIN } from "./director";
export { armSoundEngine } from "./engine";
export { toggleSoundMuted, useSoundPrefs } from "./settings";

const director = createDirector({
  takeCount,
  isMuted: () => getSoundPrefs().muted || !engineReady(),
});

type SoundLogEntry = { event: SoundEvent; opts?: PlayOptions; voices: number };

export const playSound = (event: SoundEvent, opts?: PlayOptions): void => {
  if (typeof window === "undefined") return;
  const voices = director.play(event, opts);
  voices.forEach(playVoice);
  // Test hook: a probe that sets `window.__unbrewedSoundLog = []` sees every
  // request and how many sounds it produced (0 = dropped). Unset in real use.
  (
    window as unknown as { __unbrewedSoundLog?: SoundLogEntry[] }
  ).__unbrewedSoundLog?.push({ event, opts, voices: voices.length });
};

/**
 * Dragging one of your own tokens: a soft lift once it has really moved (a
 * click that only selects makes no sound), and a landing when it is released.
 * Wired with one line each in the board's drag and drag-end handlers.
 */
const LIFT_AFTER_PX = 5;
let drag:
  | { x: number; y: number; card: boolean; lifted: boolean }
  | undefined;

export const soundDragMove = (token: {
  x: number;
  y: number;
  card?: unknown;
}): void => {
  if (!drag) {
    drag = { x: token.x, y: token.y, card: !!token.card, lifted: false };
    return;
  }
  if (drag.lifted) return;
  if (Math.hypot(token.x - drag.x, token.y - drag.y) < LIFT_AFTER_PX) return;
  drag.lifted = true;
  playSound(drag.card ? "cardUp" : "tokenUp");
};

export const soundDragEnd = (): void => {
  const ended = drag;
  drag = undefined;
  if (ended?.lifted) playSound(ended.card ? "place" : "tokenDown");
};
