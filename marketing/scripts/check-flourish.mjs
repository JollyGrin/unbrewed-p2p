#!/usr/bin/env node
// Control check for the particle flourish (src/shared/particles.ts and each
// composition's own choreography beside its timeline).
//
//   npm run check:flourish
//
// Two things have to hold for the flourish to stay seasoning rather than a
// screensaver, and neither is visible in any single rendered frame:
//
//   1. BURSTS ONLY ON CUES — every burst is silent on every frame that is not
//      inside a window opened by a cue frame from that composition's
//      timeline.ts. No stray one-off flickers, and retiming a beat moves a
//      burst with its sound.
//   2. SUBTLETY + DETERMINISM — the ambient field never exceeds its opacity
//      budget on any frame of any style, and nothing in the flourish reaches
//      for Math.random(): Remotion renders frames independently, so that would
//      re-roll the field on every frame.
//
// The modules under test are TypeScript; this transpiles them with the repo's
// own typescript rather than adding a test runner to a render-only package.

import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const SRC = path.join(import.meta.dirname, "..", "src");

/** The pure modules, as src-relative paths. Transpiled as a graph so the
 * shared maths can be imported by each composition's choreography. */
const MODULES = [
  "shared/particles",
  "DeckAnnouncement/timeline",
  "DeckAnnouncement/particles",
  "CosmeticsAnnouncement/timeline",
  "CosmeticsAnnouncement/flourish",
];

/** Transpile the module graph into a temp dir, mirroring src's layout. */
const loadAll = async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "flourish-"));
  for (const module of MODULES) {
    const { outputText } = ts.transpileModule(
      readFileSync(path.join(SRC, `${module}.ts`), "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      },
    );
    const out = path.join(dir, `${module}.mjs`);
    mkdirSync(path.dirname(out), { recursive: true });
    // node wants explicit extensions where the bundler does not
    writeFileSync(
      out,
      outputText.replace(/from ["'](\.[^"']*)["']/g, 'from "$1.mjs"'),
    );
  }
  const loaded = {};
  for (const module of MODULES) {
    loaded[module] = await import(
      pathToFileURL(path.join(dir, `${module}.mjs`)).href
    );
  }
  return loaded;
};

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

/** Stands in for Remotion's seeded `random()`: deterministic per key. */
const rnd = (key) => {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index++) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 100000) / 100000;
};

const modules = await loadAll();
const {
  PARTICLE_STYLES,
  buildField,
  burstParticles,
  burstProgress,
  particleAt,
  shimmerAt,
} = modules["shared/particles"];

const deckTimeline = modules["DeckAnnouncement/timeline"];
const deckFlourish = modules["DeckAnnouncement/particles"];
const cosmeticsTimelineModule = modules["CosmeticsAnnouncement/timeline"];
const cosmeticsFlourish = modules["CosmeticsAnnouncement/flourish"];

/** The fan anchors HowItPlays hands the flourish — geometry is irrelevant here. */
const anchors = (count) =>
  Array.from({ length: count }, (_, index) => ({
    x: 1330,
    y: 560 + index * 20,
  }));

/**
 * One composition to check: every deck shape the deck promo can produce, and
 * the cosmetics ad's single fixed shape. Each entry answers a timeline, its
 * bursts, the frames its cues fire on, its ambient dim, and the frames the
 * viewer is READING on (where the field must have backed off).
 */
const CASES = [
  ...[
    { cards: 3, hasQuote: true },
    { cards: 4, hasQuote: true },
    { cards: 3, hasQuote: false },
    { cards: 4, hasQuote: false },
  ].map(({ cards, hasQuote }) => {
    const timeline = deckTimeline.promoTimeline(cards, hasQuote);
    const cues = deckTimeline.promoCues(timeline);
    return {
      label: `deck: ${cards} cards, ${hasQuote ? "quote" : "no quote"}`,
      timeline,
      bursts: deckFlourish.burstsFor(timeline, anchors(cards)),
      expectedBursts: cards + 2,
      cueFrames: new Set([cues.nameSlam, ...cues.cardLands, cues.sting]),
      dim: (frame) => deckFlourish.ambientDim(frame, timeline, hasQuote),
      reading: [
        timeline.niche.from + 40,
        timeline.cards.from + 60,
        timeline.cards.from + timeline.cards.perCard + 60,
      ],
    };
  }),
  (() => {
    const timeline = cosmeticsTimelineModule.cosmeticsTimeline();
    const cues = cosmeticsFlourish.cosmeticsCues(timeline);
    return {
      label: "cosmetics",
      timeline,
      bursts: cosmeticsFlourish.burstsFor(timeline),
      // ignition + 4 rungs + 3 copies + 4 token tiers + 2 slams + the sting
      expectedBursts: 15,
      cueFrames: new Set([
        cues.ignite,
        ...cues.rungs,
        cues.copies,
        ...cues.tokenTiers,
        ...cues.tableSlams,
        cues.sting,
      ]),
      dim: (frame) => cosmeticsFlourish.ambientDim(frame, timeline),
      reading: [
        timeline.hook.from + timeline.hook.duration - 20,
        timeline.earn.from + 60,
        timeline.everyCopy.from + 60,
        timeline.token.from + 60,
      ],
    };
  })(),
];

// ---- 1. bursts only fire on cue frames ----
for (const { label, timeline, bursts, expectedBursts, cueFrames } of CASES) {
  check(
    bursts.length === expectedBursts,
    `${label}: expected ${expectedBursts} bursts, got ${bursts.length}`,
  );
  for (const burst of bursts) {
    check(
      cueFrames.has(burst.at),
      `${label}: burst "${burst.seed}" fires at ${burst.at}, which is not an audio cue frame`,
    );
  }

  for (let frame = 0; frame < timeline.total; frame++) {
    for (const burst of bursts) {
      const inside = frame >= burst.at && frame < burst.at + burst.duration;
      const progress = burstProgress(frame, burst);
      check(
        inside ? progress >= 0 : progress === 0,
        `${label}: burst "${burst.seed}" has progress ${progress} at frame ${frame} (inside=${inside})`,
      );
      const drawn =
        burst.kind === "shimmer"
          ? (shimmerAt(burst, frame)?.opacity ?? 0)
          : burstParticles(burst, frame, rnd).reduce(
              (sum, particle) => sum + particle.opacity,
              0,
            );
      check(
        inside || drawn === 0,
        `${label}: burst "${burst.seed}" drew ${drawn} outside its window at frame ${frame}`,
      );
    }
  }
}

// ---- 2. the ambient field stays inside its subtlety budget ----
const AMBIENT_BUDGET = 0.22; // no single particle may be brighter than this
const READING_BUDGET = 0.6; // and it dims to at most this share under copy

for (const style of PARTICLE_STYLES) {
  const field = buildField(style, rnd);
  check(
    field.length >= 30 && field.length <= 60,
    `${style}: field has ${field.length} particles, want 30–60`,
  );
  check(
    new Set(field.map((spec) => spec.depth)).size >= 2,
    `${style}: field has fewer than 2 depth layers`,
  );

  for (const { label, timeline, dim, reading } of CASES) {
    for (let frame = 0; frame < timeline.total; frame += 3) {
      const at = dim(frame);
      check(
        at >= 0 && at <= 1,
        `${style} / ${label}: ambientDim ${at} out of range at frame ${frame}`,
      );
      for (const spec of field) {
        const particle = particleAt(spec, frame, style);
        check(
          particle.opacity * at <= AMBIENT_BUDGET,
          `${style} / ${label}: a particle hit ${(particle.opacity * at).toFixed(3)} at frame ${frame}`,
        );
      }
    }
    // under the copy-heavy beats the field must actually back off
    for (const frame of reading) {
      check(
        dim(frame) <= READING_BUDGET,
        `${style} / ${label}: ambient field is at ${dim(frame).toFixed(2)} during a reading beat (frame ${frame})`,
      );
    }
  }
}

// ---- 3. no Math.random() anywhere in a composition ----
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? walk(path.join(dir, entry.name))
      : [path.join(dir, entry.name)],
  );

/** Comments talk ABOUT Math.random() — only real calls count. */
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

for (const file of walk(SRC)) {
  if (!/\.tsx?$/.test(file)) continue;
  if (stripComments(readFileSync(file, "utf8")).includes("Math.random(")) {
    failures.push(
      `${path.relative(SRC, file)} calls Math.random() — frames render independently, so it would flicker`,
    );
  }
}

if (failures.length > 0) {
  console.error(`check-flourish: ${failures.length} failure(s)`);
  for (const failure of failures.slice(0, 12)) console.error(`  - ${failure}`);
  if (failures.length > 12) {
    console.error(`  … and ${failures.length - 12} more`);
  }
  process.exit(1);
}

console.log(
  "check-flourish: bursts fire only on timeline cue frames, the ambient field stays inside its budget, and nothing rolls Math.random().",
);
