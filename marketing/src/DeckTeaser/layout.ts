/** Teaser-only geometry, in frame pixels. The side-deck track and the
 * RewardBeat stage are BonusShowcase's (`../BonusShowcase/layout`). */
import { STAGE, trackSlot } from "../BonusShowcase/layout";

/** A played main-deck card: portrait, left of the stage. */
export const PLAY_CARD = { x: 430, y: 560, h: 500 };

/** Where a flashed side-deck card pops to: below its own slot, kept on screen. */
export const flashPlace = (index: number, count: number) => {
  const slot = trackSlot(index, count);
  return { x: Math.max(420, Math.min(1500, slot.x)), y: 470, w: 460 };
};

/** The payoff's target, stage-local and absolute. */
export const PAYOFF_TARGET_LOCAL = { x: 770, y: 300 };
export const PAYOFF_TARGET = {
  x: STAGE.x - STAGE.w / 2 + PAYOFF_TARGET_LOCAL.x,
  y: STAGE.y - STAGE.h / 2 + PAYOFF_TARGET_LOCAL.y,
};
