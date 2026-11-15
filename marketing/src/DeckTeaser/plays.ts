import type { EffectCue, EffectParams } from "../BonusShowcase/effects";
import type { BonusDeck, PromoCard } from "../shared/deck";
import type { PlayEffect } from "./schema";
import { PAYOFF_CUE } from "./timeline";

/**
 * Every number a played card's vignette draws, read from the card text (and
 * the deck's hero/sidekick/side deck). A card whose text does not say what
 * its mechanic needs fails the render before frame 0 and quotes the text.
 */
export type PlayParams =
  | {
      kind: "regroup";
      move: number;
      heal: number;
      draw: number;
      fighters: string[];
    }
  | { kind: "splash"; damage: number; split: number; sidekick?: string }
  | {
      kind: "scaling";
      base: number;
      per: number;
      /** how many side-deck cards are completed by the payoff — all of them */
      completed: number;
      /** a featured reward made the hero ranged, so the payoff fires from range */
      ranged: boolean;
    };

const textOf = (card: PromoCard) =>
  [card.basicText, card.immediateText, card.duringText, card.afterText]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

const read = (
  card: PromoCard,
  effect: PlayEffect,
  pattern: RegExp,
  wanted: string,
): number => {
  const match = textOf(card).match(pattern);
  if (!match) {
    throw new Error(
      `DeckTeaser: "${card.title}" is set to effect "${effect}", but its text does not mention ${wanted}. Text: "${textOf(card)}"`,
    );
  }
  return Number(match[1]);
};

export const playParams = (
  effect: PlayEffect,
  card: PromoCard,
  deck: BonusDeck,
  rewards: EffectParams[],
): PlayParams => {
  switch (effect) {
    case "regroup":
      return {
        kind: "regroup",
        move: read(card, effect, /up to (\d+) spaces/i, '"up to N spaces"'),
        heal: read(
          card,
          effect,
          /recovers (\d+) health/i,
          '"recovers N health"',
        ),
        draw: read(card, effect, /draw up to (\d+)/i, '"draw up to N"'),
        fighters: [deck.hero.name, deck.sidekick?.name].filter(
          (name): name is string => Boolean(name),
        ),
      };
    case "splash":
      return {
        kind: "splash",
        damage: read(card, effect, /deal (\d+) damage/i, '"deal N damage"'),
        split: /split/i.test(textOf(card))
          ? read(card, effect, /across (\d+) fighters/i, '"across N fighters"')
          : 1,
        sidekick: deck.sidekick?.name,
      };
    case "scaling":
      if (card.value == null) {
        throw new Error(`DeckTeaser: "${card.title}" has no value to scale.`);
      }
      return {
        kind: "scaling",
        base: card.value,
        per: read(
          card,
          effect,
          /\+(\d+) for each completed adventure/i,
          '"+N for each completed Adventure"',
        ),
        completed: deck.pairs.length,
        ranged: deck.hero.isRanged || rewards.some((r) => r.kind === "reach"),
      };
  }
};

/** Vignette timing for the played cards, from `PLAY_CUE.effect`. */
export const PLAY_VIGNETTE = {
  regroup: {
    heroFrom: 4,
    sidekickFrom: 10,
    hop: 7,
    heal: 42,
    drawFrom: 50,
    drawGap: 6,
  },
  splash: { shot: 6, impact: 26 },
} as const;

export const playCues = (params: PlayParams): EffectCue[] => {
  switch (params.kind) {
    case "regroup": {
      const v = PLAY_VIGNETTE.regroup;
      return [
        ...Array.from({ length: params.move }, (_, index) => ({
          sfx: "stat-tick",
          at: v.heroFrom + (index + 1) * v.hop,
          volume: 0.35,
        })),
        { sfx: "boost-coin", at: v.heal, volume: 0.35 },
        ...Array.from({ length: params.draw }, (_, index) => ({
          sfx: "card-swish",
          at: v.drawFrom + index * v.drawGap,
          volume: 0.3,
        })),
      ];
    }
    case "splash": {
      const v = PLAY_VIGNETTE.splash;
      return [
        { sfx: "riser", at: v.shot, volume: 0.45, playbackRate: 0.9 },
        { sfx: "name-slam", at: v.impact, volume: 0.55 },
        { sfx: "slam-sub", at: v.impact, volume: 0.35 },
      ];
    }
    case "scaling": {
      // payoff cues are frames from the payoff's own start
      const c = PAYOFF_CUE;
      return [
        ...Array.from({ length: params.completed }, (_, index) => ({
          sfx: "stat-tick",
          at: c.climbFrom + index * c.climbGap,
          volume: 0.55,
        })),
        {
          sfx: "boost-coin",
          at: c.climbFrom + params.completed * c.climbGap,
          volume: 0.45,
        },
        { sfx: "riser", at: c.beamFrom, volume: 0.6, playbackRate: 0.75 },
        { sfx: "name-slam", at: c.hit, volume: 0.9 },
        { sfx: "slam-sub", at: c.hit, volume: 0.5 },
      ];
    }
  }
};

/** A two-word chip for a flashed reward, from its params (never typed). */
export const flashLabel = (params: EffectParams): string => {
  switch (params.kind) {
    case "reach":
      return `${params.hero} turns ranged`;
    case "exile":
      return `Exile up to ${params.count}`;
    case "revive":
      return `${params.fighter} returns at ${params.health}`;
    case "move":
      return `Move ${params.from} → ${params.to}`;
    case "blindBoost":
      return "Blind boost";
  }
};
