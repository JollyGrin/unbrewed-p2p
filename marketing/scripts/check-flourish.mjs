#!/usr/bin/env node
// Control check for the particle flourish (src/DeckAnnouncement/particles.ts).
//
//   npm run check:flourish
//
// Two things have to hold for the flourish to stay seasoning rather than a
// screensaver, and neither is visible in any single rendered frame:
//
//   1. BURSTS ONLY ON CUES — every burst is silent on every frame that is not
//      inside a window opened by a cue frame from timeline.ts. No stray
//      one-off flickers, and retiming a beat moves a burst with its sound.
//   2. SUBTLETY + DETERMINISM — the ambient field never exceeds its opacity
//      budget on any frame of any style, and nothing in the flourish reaches
//      for Math.random(): Remotion renders frames independently, so that would
//      re-roll the field on every frame.
//
// The modules under test are TypeScript; this transpiles them with the repo's
// own typescript rather than adding a test runner to a render-only package.

import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const SRC = path.join(import.meta.dirname, "..", "src", "DeckAnnouncement");
const MODULES = ["timeline", "particles"];

/** Transpile the pure modules into a temp dir and import them as ESM. */
const load = async (name) => {
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
    // node wants explicit extensions where the bundler does not
    writeFileSync(
      path.join(dir, `${module}.mjs`),
      outputText.replace(/from ["']\.\/(\w+)["']/g, 'from "./$1.mjs"'),
    );
  }
  return import(pathToFileURL(path.join(dir, `${name}.mjs`)).href);
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

const { promoTimeline, promoCues } = await load("timeline");
const {
  PARTICLE_STYLES,
  ambientDim,
  buildField,
  burstParticles,
  burstProgress,
  burstsFor,
  particleAt,
  shimmerAt,
} = await load("particles");

// Every deck shape the template can produce (3 or 4 cards, quote or no quote).
const SHAPES = [
  { cards: 3, hasQuote: true },
  { cards: 4, hasQuote: true },
  { cards: 3, hasQuote: false },
  { cards: 4, hasQuote: false },
];

/** The fan anchors HowItPlays hands the flourish — geometry is irrelevant here. */
const anchors = (count) =>
  Array.from({ length: count }, (_, index) => ({
    x: 1330,
    y: 560 + index * 20,
  }));

// ---- 1. bursts only fire on cue frames ----
for (const { cards, hasQuote } of SHAPES) {
  const label = `${cards} cards, ${hasQuote ? "quote" : "no quote"}`;
  const timeline = promoTimeline(cards, hasQuote);
  const cues = promoCues(timeline);
  const bursts = burstsFor(timeline, anchors(cards));
  const cueFrames = new Set([cues.nameSlam, ...cues.cardLands, cues.sting]);

  check(
    bursts.length === cards + 2,
    `${label}: expected ${cards + 2} bursts, got ${bursts.length}`,
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

  for (const { cards, hasQuote } of SHAPES) {
    const timeline = promoTimeline(cards, hasQuote);
    for (let frame = 0; frame < timeline.total; frame += 3) {
      const dim = ambientDim(frame, timeline, hasQuote);
      check(
        dim >= 0 && dim <= 1,
        `${style}: ambientDim ${dim} out of range at frame ${frame}`,
      );
      for (const spec of field) {
        const at = particleAt(spec, frame, style);
        check(
          at.opacity * dim <= AMBIENT_BUDGET,
          `${style}: a particle hit ${(at.opacity * dim).toFixed(3)} at frame ${frame}`,
        );
      }
    }
    // under the copy-heavy beats the field must actually back off
    const reading = [
      timeline.niche.from + 40,
      timeline.cards.from + 60,
      timeline.cards.from + timeline.cards.perCard + 60,
    ];
    for (const frame of reading) {
      const dim = ambientDim(frame, timeline, hasQuote);
      check(
        dim <= READING_BUDGET,
        `${style}: ambient field is at ${dim.toFixed(2)} during a reading beat (frame ${frame})`,
      );
    }
  }
}

// ---- 3. no Math.random() anywhere in the composition ----
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
