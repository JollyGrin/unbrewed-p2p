import type { BonusCard, BonusDeck } from "../shared/deck";
import type { BonusEffect } from "./schema";

/**
 * Every number a vignette draws, read out of the deck JSON: the reward's own
 * rules text plus the hero and sidekick stat lines. Props only name the
 * mechanic. If a reward's text does not say what the mechanic needs, the
 * render fails here (in calculateMetadata, before frame 0) with the text it
 * read, rather than animating a number somebody typed into the props.
 */
export type EffectParams =
  | { kind: "reach"; hero: string; wasRanged: boolean }
  | { kind: "exile"; count: number }
  | { kind: "revive"; fighter: string; health: number; maxHealth: number }
  | { kind: "move"; hero: string; from: number; to: number }
  | { kind: "blindBoost"; hero: string; sidekick?: string };

const textOf = (card: BonusCard) =>
  [card.basicText, card.immediateText, card.duringText, card.afterText]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

const fail = (card: BonusCard, effect: BonusEffect, wanted: string): never => {
  throw new Error(
    `BonusShowcase: "${card.title}" is set to effect "${effect}", but its text does not mention ${wanted}. Text: "${textOf(card)}"`,
  );
};

const number = (
  card: BonusCard,
  effect: BonusEffect,
  pattern: RegExp,
  wanted: string,
) => {
  const match = textOf(card).match(pattern);
  return match ? Number(match[1]) : fail(card, effect, wanted);
};

export const effectParams = (
  effect: BonusEffect,
  card: BonusCard,
  deck: BonusDeck,
): EffectParams => {
  const text = textOf(card);
  switch (effect) {
    case "reach":
      if (!/\branged\b/i.test(text)) fail(card, effect, "a ranged fighter");
      return {
        kind: "reach",
        hero: deck.hero.name,
        wasRanged: deck.hero.isRanged,
      };
    case "exile":
      return {
        kind: "exile",
        count: number(card, effect, /up to (\d+) cards?/i, '"up to N cards"'),
      };
    case "revive": {
      if (!deck.sidekick) {
        throw new Error(
          `BonusShowcase: "${card.title}" revives a fighter, but ${deck.slug} has no sidekick to bring back.`,
        );
      }
      return {
        kind: "revive",
        fighter: deck.sidekick.name,
        health: number(card, effect, /health to (\d+)/i, '"health to N"'),
        maxHealth: deck.sidekick.hp,
      };
    }
    case "move":
      return {
        kind: "move",
        hero: deck.hero.name,
        from: deck.hero.move,
        to: number(card, effect, /movement is (\d+)/i, '"movement is N"'),
      };
    case "blindBoost":
      if (!/blind boost/i.test(text)) fail(card, effect, '"BLIND BOOST"');
      return {
        kind: "blindBoost",
        hero: deck.hero.name,
        sidekick:
          deck.sidekick && /adjacent/i.test(text)
            ? deck.sidekick.name
            : undefined,
      };
  }
};

/** "Adventure 4:\nPomni’s Perilous Pilgrimage" → "Pomni’s Perilous Pilgrimage". */
export const subtitleOf = (card: BonusCard) => {
  const colon = card.title.indexOf(":");
  return colon < 0
    ? ""
    : card.title
        .slice(colon + 1)
        .replace(/\s+/g, " ")
        .trim();
};

/** The rules text with a leading "Reward:" label dropped. */
export const rulesOf = (card: BonusCard) =>
  textOf(card).replace(/^reward\s*:\s*/i, "");

/** One SFX hit inside a vignette, in frames from the vignette's start. */
export type EffectCue = {
  sfx: string;
  at: number;
  volume: number;
  playbackRate?: number;
};

/**
 * Vignette timing, shared by the drawing (`Vignette.tsx`) and the sound
 * (`audio.tsx`). Frames are counted from `CUE.effect`.
 */
export const VIGNETTE = {
  reach: { lineFrom: 4, lineTo: 28, ranged: 32 },
  exile: { first: 6, gap: 12, lift: 10, tear: 14 },
  revive: { burst: 20, pipsFrom: 26, pipGap: 5 },
  move: { tickFrom: 4, tickGap: 7, hopFrom: 20, hopGap: 9 },
  blindBoost: { slideIn: 14, reveal: 18, slideBack: 34, tucked: 52 },
} as const;

export const effectCues = (params: EffectParams): EffectCue[] => {
  switch (params.kind) {
    case "reach": {
      const v = VIGNETTE.reach;
      return [
        { sfx: "riser", at: v.lineFrom, volume: 0.5, playbackRate: 0.7 },
        { sfx: "card-thock", at: v.lineTo, volume: 0.55 },
        { sfx: "boost-coin", at: v.ranged, volume: 0.4 },
      ];
    }
    case "exile": {
      const v = VIGNETTE.exile;
      return Array.from({ length: params.count }, (_, index) => {
        const lift = v.first + index * v.gap;
        return [
          { sfx: "card-swish", at: lift, volume: 0.35 },
          { sfx: "slam-sub", at: lift + v.lift, volume: 0.35 },
          { sfx: "stat-tick", at: lift + v.lift, volume: 0.5 },
        ];
      }).flat();
    }
    case "revive": {
      const v = VIGNETTE.revive;
      return [
        { sfx: "riser", at: 0, volume: 0.6, playbackRate: 0.8 },
        { sfx: "name-slam", at: v.burst, volume: 0.6 },
        { sfx: "slam-sub", at: v.burst, volume: 0.4 },
        ...Array.from({ length: params.health }, (_, index) => ({
          sfx: "stat-tick",
          at: v.pipsFrom + index * v.pipGap,
          volume: 0.45,
        })),
        {
          sfx: "boost-coin",
          at: v.pipsFrom + params.health * v.pipGap,
          volume: 0.35,
        },
      ];
    }
    case "move": {
      const v = VIGNETTE.move;
      const steps = Math.max(0, params.to - params.from);
      return [
        ...Array.from({ length: steps }, (_, index) => ({
          sfx: "stat-tick",
          at: v.tickFrom + (index + 1) * v.tickGap,
          volume: 0.55,
        })),
        {
          sfx: "boost-coin",
          at: v.tickFrom + steps * v.tickGap + 2,
          volume: 0.35,
        },
        ...Array.from({ length: params.to }, (_, index) => ({
          sfx: "card-thock",
          at: v.hopFrom + (index + 1) * v.hopGap,
          volume: 0.3,
        })),
      ];
    }
    case "blindBoost": {
      const v = VIGNETTE.blindBoost;
      return [
        { sfx: "card-swish", at: 0, volume: 0.45 },
        { sfx: "card-thock", at: v.slideIn, volume: 0.6 },
        { sfx: "boost-coin", at: v.reveal, volume: 0.35 },
        { sfx: "card-swish", at: v.slideBack, volume: 0.4 },
        { sfx: "card-thock", at: v.tucked, volume: 0.45 },
      ];
    }
  }
};
