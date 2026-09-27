/**
 * Turns a MakerWorld / Bambu Studio .3mf into one binary STL for render.cjs.
 *
 * WHY THIS EXISTS. MakerWorld hands out print-ready 3MFs written with the 3MF
 * production extension: 3D/3dmodel.model holds only a build item pointing at a
 * component in 3D/Objects/object_N.model. three.js's 3MFLoader does not follow
 * those `p:path` references and throws ("reading 'mesh'"), so render.html gets
 * nothing. Converting once to STL keeps the renderer on the one format it
 * already handles well.
 *
 * WHY STREAMING. A detailed miniature's object file is hundreds of megabytes of
 * XML (Kenshiro: 414 MB). Parsing it as a DOM would need several GB; scanning
 * the text stream for <vertex> and <triangle> tags needs only the vertex array.
 *
 * WHY SIMPLIFIED. The same miniature is also far denser than a board needs —
 * two to five million triangles, which crashes the headless WebGL renderer,
 * while the figure ends up about 60px tall. Vertices are snapped to a grid of
 * GRID_STEPS cells across the model's height (vertex clustering) and triangles
 * that collapse or repeat are dropped. At 400 steps a 60mm figure's cell is
 * 0.15mm: invisible in a 900px render, and a few hundred thousand triangles
 * (see MAX_TRIANGLES for the dense ones).
 *
 * Transforms: each component's and build item's `transform` (3MF's row-major
 * 3x4, p' = p·M + t) is applied, so the STL comes out standing the way the
 * model was placed on the print plate — upright, which is what render.html
 * expects. Uniform scale is harmless: the renderer measures the footprint.
 *
 * One figure per file: a plate can hold several copies (Appa's has three, at
 * two sizes), which would render side by side. `--item=N` keeps only the Nth
 * printable build item. Print kits whose parts lie scattered on the plate
 * cannot be put together from the file (Bambu's assembly view was tried: it
 * leaves parts behind); pick a one-piece model for those.
 */
const fs = require("fs");
const { execFileSync, spawn } = require("child_process");

const args = process.argv.slice(2);
const [input, output] = args.filter((a) => !a.startsWith("--"));
const itemArg = args.find((a) => a.startsWith("--item="));
const onlyItem = itemArg ? Number(itemArg.slice("--item=".length)) : null;
if (!input || !output || (onlyItem !== null && !Number.isInteger(onlyItem))) {
  console.error("usage: node scripts/figures/3mf-to-stl.cjs in.3mf out.stl [--item=N]");
  process.exit(2);
}

/** Grid cells across the model's height; see "WHY SIMPLIFIED". */
const GRID_STEPS = 400;
/**
 * Above this the headless renderer ran out of memory (a 2M-triangle Malfurion
 * crashed it; Thrall at ~900k rendered). A wide model — wings, a big scenic
 * base — keeps many triangles even at 400 steps, so the grid coarsens by a
 * quarter until it fits, but never below MIN_GRID_STEPS.
 */
const MAX_TRIANGLES = 700000;
const MIN_GRID_STEPS = 150;

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
const parseTransform = (s) => (s ? s.trim().split(/\s+/).map(Number) : IDENTITY);
/** a then b, both 3MF row-vector 3x4 matrices */
const compose = (a, b) => {
  const out = new Array(12);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) {
      const base = r < 3 ? 0 : b[9 + c];
      out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c] + base;
    }
  }
  return out;
};
const apply = (m, x, y, z) => [
  x * m[0] + y * m[3] + z * m[6] + m[9],
  x * m[1] + y * m[4] + z * m[7] + m[10],
  x * m[2] + y * m[5] + z * m[8] + m[11],
];
const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? m[1] : undefined;
};

const entries = execFileSync("unzip", ["-Z1", input], { encoding: "utf8" }).split("\n").filter(Boolean);
const root = execFileSync("unzip", ["-p", input, "3D/3dmodel.model"], { encoding: "utf8", maxBuffer: 1 << 30 });

/**
 * What to draw: for every build item, each mesh reached through it, as
 * { file, objectId, transform }. A root object may hold a mesh itself or list
 * components, which may live in another file.
 */
const rootObjects = new Map();
for (const m of root.matchAll(/<object\b([^>]*)>([\s\S]*?)<\/object>/g)) {
  const comps = [...m[2].matchAll(/<component\b[^>]*>/g)].map(([tag]) => ({
    file: (attr(tag, "p:path") ?? "/3D/3dmodel.model").replace(/^\//, ""),
    objectId: attr(tag, "objectid"),
    transform: parseTransform(attr(tag, "transform")),
  }));
  rootObjects.set(attr(`<x${m[1]}>`, "id"), { comps, hasMesh: /<mesh\b/.test(m[2]) });
}
const targets = [];
const printableItems = [...root.matchAll(/<item\b[^>]*>/g)].map(([tag]) => tag).filter((tag) => attr(tag, "printable") !== "0");
if (onlyItem !== null && !printableItems[onlyItem]) throw new Error(`${input}: no printable item ${onlyItem} (has ${printableItems.length})`);
for (const tag of onlyItem === null ? printableItems : [printableItems[onlyItem]]) {
  const obj = rootObjects.get(attr(tag, "objectid"));
  const itemT = parseTransform(attr(tag, "transform"));
  if (!obj) continue;
  if (obj.hasMesh) targets.push({ file: "3D/3dmodel.model", objectId: attr(tag, "objectid"), transform: itemT });
  for (const c of obj.comps) targets.push({ ...c, transform: compose(c.transform, itemT) });
}
if (targets.length === 0) throw new Error(`${input}: no printable build items`);
for (const t of targets) if (!entries.includes(t.file)) throw new Error(`${input}: missing ${t.file}`);

/**
 * Streams one model file. For the wanted object ids it calls onVertex with
 * every transformed vertex and onTriangle with every triangle's three
 * transformed corners.
 */
const streamMeshes = (file, wanted, { onVertex, onTriangle }) =>
  new Promise((resolve, reject) => {
    const proc = spawn("unzip", ["-p", input, file]);
    let rest = "";
    let current = null;
    let verts = [];
    const TAG = /<(object|vertex|triangle)\b([^>]*)>/g;
    proc.stdout.setEncoding("utf8");
    proc.stdout.on("data", (chunk) => {
      const text = rest + chunk;
      const cut = text.lastIndexOf(">") + 1;
      rest = text.slice(cut);
      TAG.lastIndex = 0;
      const body = text.slice(0, cut);
      let m;
      while ((m = TAG.exec(body))) {
        if (m[1] === "object") {
          const id = attr(`<x${m[2]}>`, "id");
          current = wanted.has(id) ? wanted.get(id) : null;
          verts = [];
        } else if (!current) {
          continue;
        } else if (m[1] === "vertex") {
          const a = `<x${m[2]}>`;
          const p = apply(current, Number(attr(a, "x")), Number(attr(a, "y")), Number(attr(a, "z")));
          verts.push(p);
          if (onVertex) onVertex(p);
        } else if (onTriangle) {
          const a = `<x${m[2]}>`;
          onTriangle(verts[Number(attr(a, "v1"))], verts[Number(attr(a, "v2"))], verts[Number(attr(a, "v3"))]);
        }
      }
    });
    proc.on("error", reject);
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`unzip exited ${code} on ${file}`))));
  });

/** Every mesh to draw, grouped by the file that holds it: file -> (objectId -> transform). */
const byFile = new Map();
for (const t of targets) {
  const m = byFile.get(t.file) ?? new Map();
  // One object reached twice (two copies on the plate) would draw twice; a
  // figure is one piece, so the first placement wins.
  if (!m.has(t.objectId)) m.set(t.objectId, t.transform);
  byFile.set(t.file, m);
}
const eachFile = async (handlers) => {
  for (const [file, wanted] of byFile) await streamMeshes(file, wanted, handlers);
};

/**
 * Pass 2: every triangle snapped to the grid, minus the collapsed and the
 * repeated, written as binary STL. Returns how many were kept.
 */
const writeSimplified = async (lo, cell) => {
  const snap = (p) => p.map((c, k) => Math.round((c - lo[k]) / cell));
  const keyOf = (q) => `${q[0]},${q[1]},${q[2]}`;
  const out = fs.openSync(output, "w");
  fs.writeSync(out, Buffer.alloc(84)); // header + count, patched at the end
  const BATCH = 20000;
  const buf = Buffer.alloc(50 * BATCH);
  let n = 0;
  let count = 0;
  let source = 0;
  const seen = new Set();
  const flush = () => {
    if (n) fs.writeSync(out, buf, 0, n * 50);
    n = 0;
  };
  await eachFile({
    onTriangle: (a, b, c) => {
      source++;
      const q = [snap(a), snap(b), snap(c)];
      const keys = q.map(keyOf);
      if (keys[0] === keys[1] || keys[1] === keys[2] || keys[0] === keys[2]) return;
      const id = [...keys].sort().join("|");
      if (seen.has(id)) return;
      seen.add(id);
      const off = n * 50;
      let o = off + 12; // normal left 0: render.html recomputes normals
      for (const v of q) {
        for (let k = 0; k < 3; k++) buf.writeFloatLE(lo[k] + v[k] * cell, o + k * 4);
        o += 12;
      }
      buf.writeUInt16LE(0, off + 48);
      count++;
      if (++n === BATCH) flush();
    },
  });
  flush();
  const head = Buffer.alloc(84);
  head.write(`3mf-to-stl ${input.split("/").pop()}`.slice(0, 80));
  head.writeUInt32LE(count, 80);
  fs.writeSync(out, head, 0, 84, 0);
  fs.closeSync(out);
  return { count, source };
};

(async () => {
  // Pass 1: the model's extent, to size the simplification grid.
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  await eachFile({
    onVertex: (p) => {
      for (let k = 0; k < 3; k++) {
        if (p[k] < lo[k]) lo[k] = p[k];
        if (p[k] > hi[k]) hi[k] = p[k];
      }
    },
  });
  if (!(hi[2] > lo[2])) throw new Error(`${input}: model has no height`);

  // Pass 2, repeated on a coarser grid while the result is still too dense.
  let steps = GRID_STEPS;
  for (;;) {
    const { count, source } = await writeSimplified(lo, (hi[2] - lo[2]) / steps);
    if (count <= MAX_TRIANGLES || steps <= MIN_GRID_STEPS) {
      console.log(`${output}: ${count} triangles (from ${source}, ${targets.length} part(s), grid ${steps})`);
      return;
    }
    steps = Math.max(MIN_GRID_STEPS, Math.floor(steps * 0.75));
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
