/**
 * 3D minis — play-tier candidate comparison (#963). Renders C0 (the
 * committed king-taranis.play.glb) plus every candidate GLB in
 * CANDIDATES_DIR on the real tabletop at play size, then builds one contact
 * sheet + RESULTS.md so a mesh fix is picked from pixels, not a mesh viewer.
 *
 * Candidates are registered as LOCAL manifest detail levels only: the probe
 * copies each `<id>.glb` into public/minis3d/compare-<id>.glb and patches
 * the mini's `files` map in public/minis3d/manifest.json for the run, then
 * restores both (even on failure/SIGINT) — never part of the committed
 * diff. `king-taranis`'s manifest entry is the target unless MINI_ID names
 * another.
 *
 *   CANDIDATES_DIR=~/git/unbrewed/.grove/mini-mesh-quality/candidates \
 *   PW_PATH=... PROBE_URL=http://localhost:PORT \
 *   PROBE_ARGS="--use-angle=metal --enable-gpu --ignore-gpu-blocklist" \
 *     node scripts/visual-probe/tableMini3d.cjs compare --out dir
 *
 * Per candidate: a `play` crop (default board view, whole figure, a little
 * board context), a `lod` crop at play size (tight, 1:1 — neither is
 * upscaled), the same crop upscaled 4x nearest-neighbour (the LARGEST
 * column — this and zoom-base are what a reviewer judges the star on), a
 * `zoom`-style crop mid wheel-zoom (whole figure), and the bottom ~55% of
 * that (the base, also LARGE). ALL FIVE come from the same ONE probe piece,
 * always seat p1 — every row shares the same tint. (A real board fighter's
 * seat is assigned per-game and was landing on different players/tints run
 * to run — #963 review caught this; probe pieces sidestep it entirely.) One
 * page cycles every id through that single piece for the unzoomed crops,
 * then (without reloading) zooms the board once and cycles every id again
 * for the zoomed crops — mirrors lod.cjs's + zoom.cjs's approach, minus
 * their per-candidate page reloads. decode/warm ms on the CPU-throttled
 * profile mirrors decode.cjs. Triangle count and gzip bytes come from the
 * file itself.
 *
 * Row order: "play" (C0 as shipped) first, then — if present — "C0-nonormals"
 * (C0 with its NORMAL accessor stripped: GLTFLoader flat-shades any mesh with
 * no normals, so this is a renderer-only comparison, no new topology; #963
 * review named this the first thing to look at after Dean preferred
 * flatShading in the hypothesis-4 renderer check), then every other
 * candidate from CANDIDATES_DIR alphabetically.
 */
const path = require("path");
const fs = require("fs");
const os = require("os");
const zlib = require("zlib");
const sharp = require("sharp");
const { launch, startGame, referenceSpaces, probe, OUT } = require("../tableMini3d.cjs");

const REPO_ROOT = path.join(__dirname, "..", "..", "..");
const MINIS_DIR = path.join(REPO_ROOT, "public", "minis3d");
const MANIFEST_PATH = path.join(MINIS_DIR, "manifest.json");
const MINI_ID = process.env.MINI_ID || "king-taranis";
const CANDIDATES_DIR =
  process.env.CANDIDATES_DIR || path.join(os.homedir(), "git", "unbrewed", ".grove", "mini-mesh-quality", "candidates");
const PROBE_ARGS = (process.env.PROBE_ARGS || "").split(" ").filter(Boolean);
/** Candidates pinned right after "play", in this order, before the rest
 *  (alphabetical). Everything else is a normal alphabetical candidate. */
const PINNED_FIRST = ["C0-nonormals"];

const compareUrl = (id) => (id === "play" ? "/minis3d/king-taranis.play.glb" : `/minis3d/compare-${id}.glb`);
const label = (id) => {
  if (id === "play") return "C0 (committed play.glb)";
  if (id === "C0-nonormals") return "C0-nonormals (= R-flat: NORMAL stripped, re-meshopt — GLTFLoader flat-shades it)";
  return id;
};

const discoverCandidates = () => {
  if (!fs.existsSync(CANDIDATES_DIR)) return [];
  const all = fs
    .readdirSync(CANDIDATES_DIR)
    .filter((f) => f.endsWith(".glb"))
    .map((f) => f.slice(0, -4));
  const pinned = PINNED_FIRST.filter((id) => all.includes(id));
  const rest = all.filter((id) => !PINNED_FIRST.includes(id)).sort();
  return [...pinned, ...rest];
};

/** Copy candidates into public/minis3d/ and register them as local LODs.
 *  Returns a restore() that undoes both, safe to call more than once. */
const stageManifest = (candidateIds) => {
  const backup = fs.readFileSync(MANIFEST_PATH, "utf8");
  const manifest = JSON.parse(backup);
  const copied = [];
  for (const id of candidateIds) {
    const dest = path.join(MINIS_DIR, `compare-${id}.glb`);
    fs.copyFileSync(path.join(CANDIDATES_DIR, `${id}.glb`), dest);
    copied.push(dest);
    manifest.minis[MINI_ID].files[id] = `compare-${id}.glb`;
  }
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  let done = false;
  return () => {
    if (done) return;
    done = true;
    fs.writeFileSync(MANIFEST_PATH, backup);
    for (const f of copied) {
      try {
        fs.unlinkSync(f);
      } catch {}
    }
  };
};

const canvasBox = (page, ownerSelector) =>
  page.evaluate((sel) => {
    const r = document.querySelector(sel)?.getBoundingClientRect();
    return r ? { x: r.left, y: r.top, width: r.width, height: r.height } : null;
  }, ownerSelector);

/** One probe piece, always seat p1, cycled through every id twice: once
 *  unzoomed (play + lod crops), once after a single board wheel-zoom (zoom +
 *  zoom-base crops). Same session throughout, so decode/GPU state is warm
 *  and every row is directly comparable (same seat, same tint, same camera). */
const captureCrops = async (ids, results) => {
  const OWNER = '[data-badge-owner="probe-0"] [data-mini3d-canvas]';
  const { browser, page } = await launch(PROBE_ARGS);
  await startGame(page, "minis3dProbe=1");
  await page.addStyleTag({ content: "[data-badge-owner^='probe'] [data-standee-badges]{display:none!important}" });
  const { nearLeft } = await referenceSpaces(page);

  // Phase 1: unzoomed (play + lod).
  for (const id of ids) {
    await probe(page, [{ space: nearLeft, mode: "3d", seat: "p1", miniId: MINI_ID, lod: id }]);
    await page.waitForTimeout(2000);
    const box = await canvasBox(page, OWNER);
    if (!box) continue;
    const lodFile = path.join(OUT, `lod-${id}.png`);
    await page.screenshot({ path: lodFile, clip: box });
    results[id].lodCrop = lodFile;
    // Padded with board context — the default (not zoomed-in) view a player
    // actually sees, matching Dean's dean-2026-09-28-playsize.png framing.
    const padX = box.width * 1.1, padY = box.height * 0.9;
    const playFile = path.join(OUT, `play-${id}.png`);
    await page.screenshot({
      path: playFile,
      clip: { x: Math.max(0, box.x - padX), y: Math.max(0, box.y - padY), width: box.width + 2 * padX, height: box.height + 2 * padY },
    });
    results[id].playCrop = playFile;
  }
  const loads = await page.evaluate(() => window.__minis3d?.stats?.loads ?? []);
  for (const id of ids) {
    const hit = loads.find((l) => l.url === compareUrl(id));
    if (hit) results[id].firstLoad = hit;
  }

  // Phase 2: zoom the board ONCE (centred on the still-visible last piece),
  // then re-probe every id in place and crop each — no reload, no re-zoom.
  const preZoomBox = await canvasBox(page, OWNER);
  if (preZoomBox) {
    await page.mouse.move(preZoomBox.x + preZoomBox.width / 2, preZoomBox.y + preZoomBox.height / 2);
    for (let i = 0; i < 12; i++) {
      await page.mouse.wheel(0, -240);
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(1000);
    for (const id of ids) {
      await probe(page, [{ space: nearLeft, mode: "3d", seat: "p1", miniId: MINI_ID, lod: id }]);
      await page.waitForTimeout(1500);
      const z = await canvasBox(page, OWNER);
      if (!z) continue;
      const pad = 8;
      const file = path.join(OUT, `zoom-${id}.png`);
      await page.screenshot({
        path: file,
        clip: { x: Math.max(0, z.x - pad), y: Math.max(0, z.y - pad), width: z.width + 2 * pad, height: z.height + 2 * pad },
      });
      results[id].zoomCrop = file;
    }
  }
  await browser.close();
};

/** decode.cjs's recipe (4x CPU throttle, first vs. 4 warm re-decodes), run
 *  once per id in a single shared, already-throttled session. */
const decodeMs = async (ids, results) => {
  const { browser, page } = await launch(PROBE_ARGS);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await startGame(page, "minis3dProbe=1");
  await page.waitForTimeout(1000);
  for (const id of ids) {
    const r = await page.evaluate(async (u) => {
      const s = window.__minis3d.stats;
      // Cache-bust even the "first" load: the board's own boot (startGame)
      // already fetched the default lod once, so an un-busted URL would
      // return that cached promise with no new `loads` entry.
      await window.__minis3d.load(`${u}?first=1`);
      const first = s.loads[s.loads.length - 1];
      const warm = [];
      for (let i = 0; i < 4; i++) {
        await window.__minis3d.load(`${u}?warm=${i}`);
        warm.push(s.loads[s.loads.length - 1].decodeMs);
      }
      return { first, warm };
    }, compareUrl(id));
    results[id].decode = r;
  }
  await browser.close();
};

const fileStats = (ids, results) => {
  for (const id of ids) {
    const file = id === "play" ? path.join(MINIS_DIR, "king-taranis.play.glb") : path.join(CANDIDATES_DIR, `${id}.glb`);
    const bytes = fs.statSync(file).size;
    const gzipBytes = zlib.gzipSync(fs.readFileSync(file), { level: 9 }).length;
    const triangles = results[id].firstLoad?.triangles ?? results[id].decode?.first?.triangles ?? null;
    results[id].bytes = bytes;
    results[id].gzipBytes = gzipBytes;
    results[id].triangles = triangles;
  }
};

const CARD_W = 1560;
// "play" and "lod" stay 1:1 (never upscaled) — small, honest to actual size.
// "lod 4x" and "zoom base" are the two judged-on columns: LARGE.
const SMALL_H = 130;
const LARGE_H = 380;
const ZOOM_H = 220;
const ZOOM_W = 260;
const HEADER_H = 30;
const ROW_PAD = 18;
const COLUMN_LABELS_H = 22;

const svgText = (text, w, h, opts = {}) => {
  const { size = 16, color = "#eee", weight = "normal", anchor = "start", x = 6, y } = opts;
  const yy = y ?? Math.round(h / 2 + size / 3);
  const esc = String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return Buffer.from(
    `<svg width="${w}" height="${h}"><text x="${x}" y="${yy}" font-family="Menlo,monospace" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${color}">${esc}</text></svg>`
  );
};

const fmtKb = (n) => (n == null ? "?" : `${(n / 1024).toFixed(1)}KB`);
const fmtMs = (n) => (n == null ? "?" : `${n.toFixed(1)}ms`);

/** height-capped, NEVER upscaled beyond the source's native pixels. */
const nativeCapped = async (file, capH) => sharp(file).resize({ height: capH, fit: "inside", withoutEnlargement: true }).toBuffer();

const buildContactSheet = async (ids, results, outDir) => {
  const rowH = HEADER_H + LARGE_H + ROW_PAD;
  const canvasH = COLUMN_LABELS_H + rowH * ids.length + ROW_PAD;
  const composite = [
    {
      input: svgText(
        "play (1:1, default board view)   lod (1:1, tight)   ▶ lod 4x nearest (LARGE — judge here) ◀        zoom (wheel-in, whole figure)   ▶ zoom base, bottom ~55% (LARGE — judge here) ◀",
        CARD_W,
        COLUMN_LABELS_H,
        { size: 11, color: "#888" }
      ),
      top: 0,
      left: 0,
    },
  ];
  let y = COLUMN_LABELS_H;
  for (const id of ids) {
    const r = results[id];
    const w = r.decode?.warm?.length ? r.decode.warm.reduce((a, b) => a + b, 0) / r.decode.warm.length : null;
    const headerText = `${label(id)} — ${r.triangles ?? "?"} tris — ${fmtKb(r.bytes)} (gz ${fmtKb(r.gzipBytes)}) — decode ${fmtMs(
      r.decode?.first?.decodeMs
    )} / warm ${fmtMs(w)}`;
    composite.push({ input: svgText(headerText, CARD_W, HEADER_H, { size: 13, weight: "bold" }), top: y, left: 0 });
    let x = 6;
    const rowTop = y + HEADER_H;
    // Small columns vertically centred against the LARGE row height.
    const smallTop = rowTop + Math.round((LARGE_H - SMALL_H) / 2);

    if (r.playCrop && fs.existsSync(r.playCrop)) {
      const buf = await nativeCapped(r.playCrop, SMALL_H);
      const meta = await sharp(buf).metadata();
      composite.push({ input: buf, top: smallTop, left: x });
      x += (meta.width || 0) + 14;
    } else {
      composite.push({ input: svgText("(no play crop)", 140, SMALL_H, { color: "#a55" }), top: smallTop, left: x });
      x += 140 + 14;
    }

    if (r.lodCrop && fs.existsSync(r.lodCrop)) {
      const buf = await nativeCapped(r.lodCrop, SMALL_H);
      const meta = await sharp(buf).metadata();
      composite.push({ input: buf, top: smallTop, left: x });
      x += (meta.width || 0) + 14;

      // 4x nearest-neighbour upscale of the tight crop — the LARGE column.
      const raw = await sharp(r.lodCrop).metadata();
      const upBuf = await sharp(r.lodCrop)
        .resize({ width: (raw.width || 1) * 4, height: (raw.height || 1) * 4, kernel: "nearest" })
        .resize({ height: LARGE_H, fit: "inside" })
        .toBuffer();
      const upMeta = await sharp(upBuf).metadata();
      composite.push({ input: upBuf, top: rowTop, left: x });
      x += (upMeta.width || 0) + 14;
    } else {
      composite.push({ input: svgText("(no lod crop)", 140, SMALL_H, { color: "#a55" }), top: smallTop, left: x });
      x += 140 + 14;
      composite.push({ input: svgText("(no lod 4x)", LARGE_H, LARGE_H, { color: "#a55" }), top: rowTop, left: x });
      x += LARGE_H + 14;
    }

    if (r.zoomCrop && fs.existsSync(r.zoomCrop)) {
      const zoomTop = rowTop + Math.round((LARGE_H - ZOOM_H) / 2);
      const zBuf = await sharp(r.zoomCrop).resize({ height: ZOOM_H, width: ZOOM_W, fit: "cover" }).toBuffer();
      composite.push({ input: zBuf, top: zoomTop, left: x });
      x += ZOOM_W + 14;

      // The bottom ~55% of the same zoom crop — the base itself, closest to
      // Dean's dean-2026-09-28-base.png framing. LARGE column.
      const zMeta = await sharp(r.zoomCrop).metadata();
      const baseTop = Math.round((zMeta.height || 0) * 0.45);
      const baseW = LARGE_H; // square-ish display area
      const baseBuf = await sharp(r.zoomCrop)
        .extract({ left: 0, top: baseTop, width: zMeta.width || 1, height: (zMeta.height || 0) - baseTop })
        .resize({ height: LARGE_H, width: baseW, fit: "cover" })
        .toBuffer();
      composite.push({ input: baseBuf, top: rowTop, left: x });
    } else {
      composite.push({ input: svgText("(no zoom crop)", ZOOM_W + LARGE_H + 14, LARGE_H, { color: "#a55" }), top: rowTop, left: x });
    }
    y += rowH;
  }
  const out = path.join(outDir, "contact-sheet.png");
  await sharp({ create: { width: CARD_W, height: canvasH, channels: 4, background: "#14100c" } })
    .composite(composite)
    .png()
    .toFile(out);
  return out;
};

const writeResultsMd = (ids, results, outDir) => {
  const rows = ids.map((id) => {
    const r = results[id];
    const w = r.decode?.warm?.length ? r.decode.warm.reduce((a, b) => a + b, 0) / r.decode.warm.length : null;
    return `| ${label(id)} | ${r.triangles ?? "?"} | ${fmtKb(r.bytes)} | ${fmtKb(r.gzipBytes)} | ${fmtMs(r.decode?.first?.decodeMs)} | ${fmtMs(w)} |`;
  });
  const md = `# 3D minis play-tier candidate comparison (#963)

Generated by \`node scripts/visual-probe/tableMini3d.cjs compare\`. C0 is the
committed \`public/minis3d/king-taranis.play.glb\`; every other row is a local
candidate from \`${CANDIDATES_DIR}\` (never committed). Every row uses the
SAME probe piece, seat p1, same tint — directly comparable.

See \`contact-sheet.png\`: play / lod (both 1:1, never upscaled), lod 4x
nearest and zoom-base (both LARGE — judge the star and the body's
cape/fur faceting here), zoom (whole figure, wheel-zoomed).

| candidate | triangles | bytes | gzip bytes | decode ms (first, throttled) | warm decode ms (avg of 4) |
| --- | --- | --- | --- | --- | --- |
${rows.join("\n")}
`;
  fs.writeFileSync(path.join(outDir, "RESULTS.md"), md);
};

module.exports = async () => {
  const candidateIds = discoverCandidates();
  const ids = ["play", ...candidateIds];
  const results = Object.fromEntries(ids.map((id) => [id, {}]));
  const restore = stageManifest(candidateIds);
  const onExit = () => restore();
  process.on("exit", onExit);
  process.on("SIGINT", () => {
    restore();
    process.exit(130);
  });
  try {
    await captureCrops(ids, results);
    await decodeMs(ids, results);
    fileStats(ids, results);
    const sheet = await buildContactSheet(ids, results, OUT);
    writeResultsMd(ids, results, OUT);
    console.log(JSON.stringify({ ids, candidatesDir: CANDIDATES_DIR, out: OUT, sheet }, null, 2));
  } finally {
    restore();
  }
};
