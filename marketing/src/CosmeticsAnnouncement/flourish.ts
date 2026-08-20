/**
 * The cosmetics ad's flourish choreography: which frames its bursts fire on,
 * and how far the ambient field backs off under each beat. The maths they are
 * built from is generic and lives in `../shared/particles`.
 *
 * Pure — no React, no Remotion — so `scripts/check-flourish.mjs` can import it
 * and prove a burst is silent on every frame that is not a cue frame.
 */

import {
  type Burst,
  curve,
  HEIGHT,
  PUFF_FRAMES,
  SHIMMER_FRAMES,
  SPARK_FRAMES,
  WIDTH,
} from "../shared/particles";
import { CUE, type CosmeticsTimeline } from "./timeline";

/** Where the hero card sits in the hook and the ladder — sparks come off it. */
export const CARD_ANCHOR = { x: WIDTH / 2, y: 452 };

/** The fan slots in the "every copy" beat (`scenes/EveryCopy.tsx` owns the
 * geometry; this mirrors its centre line so a puff sits under each card). */
export const FAN_CENTER = { x: WIDTH / 2, y: 690 };
export const FAN_SPACING = 300;

/** The board vignette's centre, where the fighter token climbs. */
export const TOKEN_ANCHOR = { x: WIDTH / 2, y: 560 };

const fanAnchor = (slot: number, total: number) => ({
  x: FAN_CENTER.x + (slot - (total - 1) / 2) * FAN_SPACING,
  y: FAN_CENTER.y + 250,
});

/**
 * How loud the ambient field is allowed to be, beat by beat. It backs off under
 * every beat the viewer is READING — the hook's line, the /collection panel,
 * the fan caption, the token bar, the table line — and only opens up as the end
 * card takes the frame.
 */
export const ambientDim = (
  frame: number,
  timeline: CosmeticsTimeline,
): number => {
  const { hook, ladder, earn, everyCopy, token, table, cta } = timeline;
  return curve(frame, [
    [hook.from, 0.9],
    [hook.from + CUE.hookLine + 14, 0.45],
    // the ladder is the money shot and carries almost no copy — let it breathe
    [ladder.from, 0.7],
    [ladder.from + CUE.ladderSteps[3], 0.8],
    [earn.from, 0.32],
    [everyCopy.from, 0.38],
    [token.from, 0.38],
    [table.from, 0.5],
    [cta.from, 0.7],
    [cta.from + CUE.ctaSting, 1],
  ]);
};

/**
 * Every burst in one render, each pinned to a cue frame from `timeline.ts`:
 * a spark off the card on the ignition and on every rung of the ladder, a puff
 * under each copy that rims at once, a spark off the token on each threshold it
 * crosses, a puff under each card slammed on the table, and the closing
 * shimmer on the sting.
 */
export const burstsFor = (timeline: CosmeticsTimeline): Burst[] => {
  const { hook, ladder, everyCopy, token, table, cta } = timeline;
  return [
    {
      kind: "spark",
      at: hook.from + CUE.hookIgnite,
      duration: SPARK_FRAMES,
      x: CARD_ANCHOR.x,
      y: CARD_ANCHOR.y,
      seed: "ignite",
    },
    ...CUE.ladderSteps.map((step, rung) => ({
      kind: "spark" as const,
      at: ladder.from + step,
      duration: SPARK_FRAMES,
      x: CARD_ANCHOR.x,
      y: CARD_ANCHOR.y,
      seed: `rung-${rung}`,
    })),
    ...[0, 2, 4].map((slot) => ({
      kind: "puff" as const,
      at: everyCopy.from + CUE.copiesRim,
      duration: PUFF_FRAMES,
      ...fanAnchor(slot, 5),
      seed: `copy-${slot}`,
    })),
    ...CUE.tokenTiers.map((step, rung) => ({
      kind: "spark" as const,
      at: token.from + step,
      duration: SPARK_FRAMES,
      x: TOKEN_ANCHOR.x,
      y: TOKEN_ANCHOR.y,
      seed: `token-${rung}`,
    })),
    {
      kind: "puff",
      at: table.from + CUE.tableThem,
      duration: PUFF_FRAMES,
      x: 640,
      y: 850,
      seed: "table-them",
    },
    {
      kind: "puff",
      at: table.from + CUE.tableYou,
      duration: PUFF_FRAMES,
      x: 1280,
      y: 850,
      seed: "table-you",
    },
    {
      kind: "shimmer",
      at: cta.from + CUE.ctaSting,
      duration: SHIMMER_FRAMES,
      x: WIDTH / 2,
      y: HEIGHT / 2,
      seed: "sting",
    },
  ];
};

/** The cue frames above, resolved to absolute frames for one render. */
export const cosmeticsCues = (timeline: CosmeticsTimeline) => ({
  ignite: timeline.hook.from + CUE.hookIgnite,
  rungs: CUE.ladderSteps.map((step) => timeline.ladder.from + step),
  copies: timeline.everyCopy.from + CUE.copiesRim,
  tokenTiers: CUE.tokenTiers.map((step) => timeline.token.from + step),
  tableSlams: [
    timeline.table.from + CUE.tableThem,
    timeline.table.from + CUE.tableYou,
  ],
  sting: timeline.cta.from + CUE.ctaSting,
});
