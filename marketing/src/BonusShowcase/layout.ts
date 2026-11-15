/**
 * Where things sit, in 1920×1080 frame pixels. Pure, because the particle
 * bursts (`flourish.ts`) fire from the same spots the scenes draw at.
 */

/** Landscape side-deck cards: the printed art is 1600×1146 once turned. */
export const CARD_ASPECT = 1146 / 1600;

export type Place = { x: number; y: number; w: number };

/** The persistent track along the top: one slot per pair, in order. */
const TRACK_W = 168;
const TRACK_GAP = 24;
const TRACK_Y = 98;
export const trackSlot = (index: number, count: number): Place => ({
  x: 960 + (index - (count - 1) / 2) * (TRACK_W + TRACK_GAP),
  y: TRACK_Y,
  w: TRACK_W,
});

/** The intro deals the fronts into a big row before they shrink into the track. */
const ROW_W = 318;
const ROW_GAP = 26;
export const introSlot = (index: number, count: number): Place => ({
  x: 960 + (index - (count - 1) / 2) * (ROW_W + ROW_GAP),
  y: 770,
  w: ROW_W,
});

/** A beat's card while the front is being read — the stamp lands on it. */
export const FRONT_PLACE: Place = { x: 600, y: 548, w: 920 };
/** After the flip it slides aside for the vignette. */
export const BACK_PLACE: Place = { x: 440, y: 404, w: 620 };

/** The vignette's stage, right of the card. */
export const STAGE = { x: 1340, y: 420, w: 860, h: 480 };

/** The framed gameplay still, bottom right. */
export const STILL = { x: 1540, y: 815, w: 480 };

/** The outro lines the backs up in a row under the hero name. */
export const outroSlot = (index: number, count: number): Place => ({
  x: 960 + (index - (count - 1) / 2) * 300,
  y: 360,
  w: 276,
});
