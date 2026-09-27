/**
 * #962 motion set 1 as frame sequences. Probe minis (TableMini3dProbe) play
 * each motion with the board's own cues and timings, while a CDP screencast
 * records every compositor frame and an in-page rAF logger records the pose
 * each probe canvas drew (data-pose-*). Writes, per scene, the raw frames
 * (<scene>/NNNN.jpg, cropped to the pieces), a pose trace (<scene>.json) and
 * prints a summary. Scenes:
 *
 *   hop      a mini walks four spaces (one hop per space, facing the path)
 *   attack   two minis face each other; the attacker lunges on the combat
 *            panel's clock, the defender recoils at contact, then flinches
 *            where the damage arc lands
 *   defeat   the defender topples and fades
 *   lift     selected: the small lift
 *   drop     a mini appearing drops onto its base
 *
 * PROBE_SLOW=0.1 slows the page's clock tenfold (performance.now + rAF, which
 * both framer's tween and the motion timeline run on) and takes full-DPR
 * screenshots of the pieces instead of the CSS-px screencast.
 *
 * PROBE_REDUCED=1 runs the same scenes under prefers-reduced-motion (every
 * pose must stay 0). PROBE_DEVICE=desktop for the 1440×900 desktop.
 */
const path = require("path");
const fs = require("fs");
const { launch, startGame, probe, OUT } = require("../tableMini3d.cjs");

// The combat panel's 1× clock (lib/pro/combatAnimTiming + combatTiming).
const STRIKE_DELAY = 850, LUNGE = 680, CONTACT = 850 + 680 * 0.44, REACT = 680, ARC_LANDS = 1900 + 620;

/** Two neighbouring spaces near the middle of the board, and a walk route. */
const pickSpaces = (page) =>
  page.evaluate(() => {
    const plane = document.querySelector("[data-table-stage-plane]");
    const taken = new Set([...plane.querySelectorAll("[data-fighter-base][data-space-id]")].map((el) => el.getAttribute("data-space-id")));
    const spaces = [...new Map(
      [...plane.querySelectorAll("[data-space-id]")]
        .filter((el) => !el.closest("[data-fighter-base]") && !el.hasAttribute("data-fighter-base"))
        .map((el) => {
          const r = el.getBoundingClientRect();
          return [el.getAttribute("data-space-id"), { id: el.getAttribute("data-space-id"), cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width }];
        })
    ).values()].filter((s) => s.w > 2 && !taken.has(s.id));
    const mx = spaces.reduce((a, s) => a + s.cx, 0) / spaces.length, my = spaces.reduce((a, s) => a + s.cy, 0) / spaces.length;
    const d = (a, b) => Math.hypot(a.cx - b.cx, a.cy - b.cy);
    const byMid = [...spaces].sort((a, b) => d(a, { cx: mx, cy: my }) - d(b, { cx: mx, cy: my }));
    const a = byMid[0];
    // The defender: the nearest space roughly left/right of the attacker (a side view of the lunge).
    const b = [...spaces].filter((s) => s !== a).sort((p, q) => d(p, a) + Math.abs(p.cy - a.cy) - (d(q, a) + Math.abs(q.cy - a.cy)))[0];
    // A walk: greedy nearest-unvisited from a, four steps.
    const route = [a];
    while (route.length < 5) {
      const last = route[route.length - 1];
      const next = spaces.filter((s) => !route.includes(s) && s !== b).sort((p, q) => d(p, last) - d(q, last))[0];
      route.push(next);
    }
    return { a: a.id, b: b.id, route: route.map((s) => s.id) };
  });

const SLOW = Number(process.env.PROBE_SLOW) || 1;
/** Real ms for `ms` of page time. */
const real = (ms) => ms / SLOW;

/** Start the rAF pose logger and the frame capture; `stop()` returns both. */
const record = async (page, cdp, dir, clip = null) => {
  fs.mkdirSync(dir, { recursive: true });
  await page.evaluate(() => {
    window.__poseLog = [];
    const t0 = performance.now();
    const tick = () => {
      if (!window.__poseLog) return;
      const row = { t: Math.round(performance.now() - t0) };
      for (const c of document.querySelectorAll("[data-mini3d-canvas][data-fighter-id^='probe-']")) {
        row[c.dataset.fighterId] = [c.dataset.poseLift, c.dataset.poseFacing, c.dataset.poseLean, c.style.opacity || "1"].map(Number);
      }
      window.__poseLog.push(row);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const frames = [];
  if (SLOW !== 1) {
    // Full-DPR screenshots in a loop, stamped with the page's (slowed) clock.
    let on = true;
    const loop = (async () => {
      while (on) {
        const ts = await page.evaluate(() => performance.now() / 1000);
        const buf = await page.screenshot({ type: "jpeg", quality: 88, ...(clip ? { clip } : {}) });
        frames.push({ ts, data: buf.toString("base64") });
      }
    })();
    return async () => {
      on = false;
      await loop;
      return finish();
    };
  }
  const onFrame = (f) => {
    frames.push({ ts: f.metadata.timestamp, data: f.data });
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  };
  cdp.on("Page.screencastFrame", onFrame);
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 85, everyNthFrame: 1, maxWidth: 3000, maxHeight: 2000 });
  return async () => {
    await cdp.send("Page.stopScreencast");
    cdp.off("Page.screencastFrame", onFrame);
    return finish();
  };
  async function finish() {
    const poses = await page.evaluate(() => {
      const log = window.__poseLog;
      window.__poseLog = null;
      return log;
    });
    const t0 = frames.length ? frames[0].ts : 0;
    frames.forEach((f, i) => fs.writeFileSync(path.join(dir, `${String(i).padStart(4, "0")}_${Math.round((f.ts - t0) * 1000)}ms.jpg`), Buffer.from(f.data, "base64")));
    return { frames: frames.length, poses };
  }
};

/** The probe pieces' on-screen box (CSS px, padded) — where to crop. */
const pieceBox = (page) =>
  page.evaluate(() => {
    const rs = [...document.querySelectorAll("[data-mini3d-canvas][data-fighter-id^='probe-']")].map((c) => c.getBoundingClientRect());
    if (!rs.length) return null;
    const l = Math.min(...rs.map((r) => r.left)), t = Math.min(...rs.map((r) => r.top));
    const r = Math.max(...rs.map((r) => r.right)), b = Math.max(...rs.map((r) => r.bottom));
    const p = Math.max(r - l, b - t) * 0.35;
    const x = Math.max(0, l - p), y = Math.max(0, t - p);
    return { x, y, width: Math.min(innerWidth, r + p) - x, height: Math.min(innerHeight, b + p) - y, vw: innerWidth, vh: innerHeight };
  });

/** max |lift|, |lean|, facing range and min opacity per probe canvas. */
const summarise = (poses) => {
  const out = {};
  for (const row of poses)
    for (const [id, v] of Object.entries(row)) {
      if (id === "t" || !Array.isArray(v) || v.some((n) => Number.isNaN(n))) continue;
      const [lift, facing, lean, opacity] = v;
      const s = (out[id] ??= { maxLift: 0, maxLean: 0, minLean: 0, facingMin: facing, facingMax: facing, minOpacity: 1, samples: 0 });
      s.maxLift = Math.max(s.maxLift, lift);
      s.maxLean = Math.max(s.maxLean, lean);
      s.minLean = Math.min(s.minLean, lean);
      s.facingMin = Math.min(s.facingMin, facing);
      s.facingMax = Math.max(s.facingMax, facing);
      s.minOpacity = Math.min(s.minOpacity, opacity);
      s.samples++;
    }
  return out;
};

module.exports = async () => {
  const { browser, ctx, page } = await launch((process.env.PROBE_ARGS || "").split(" ").filter(Boolean));
  if (SLOW !== 1)
    await ctx.addInitScript((rate) => {
      const realNow = performance.now.bind(performance);
      const t0 = realNow();
      const now = () => t0 + (realNow() - t0) * rate;
      performance.now = now;
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => raf(() => cb(now()));
    }, SLOW);
  await startGame(page, "minis3dProbe=1");
  const cdp = await page.context().newCDPSession(page);
  const { a, b, route } = await pickSpaces(page);
  const tag = `${process.env.PROBE_DEVICE === "desktop" ? "desktop" : "phone"}${process.env.PROBE_REDUCED ? "-reduced" : ""}`;
  const base = path.join(OUT, tag);
  const results = { spaces: { a, b, route } };
  const scene = async (name, setup, play, ms, clipFor = null) => {
    await probe(page, []);
    await page.waitForTimeout(300);
    if (setup) {
      await probe(page, setup);
      await page.waitForTimeout(1200);
    }
    const box = clipFor ? await clipFor() : await pieceBox(page);
    const stop = await record(page, cdp, path.join(base, name), SLOW !== 1 && box ? box : null);
    await page.waitForTimeout(150);
    await probe(page, play);
    await page.waitForTimeout(real(ms));
    const { frames, poses } = await stop();
    fs.writeFileSync(path.join(base, `${name}.json`), JSON.stringify(poses));
    results[name] = { frames, box, pose: summarise(poses) };
  };

  // hop: stand, then the same piece with a path (framer tweens an update only).
  const routeBox = () =>
    page.evaluate((ids) => {
      const rs = ids.map((id) => document.querySelector(`[data-table-stage-plane] [data-space-id="${id}"]`).getBoundingClientRect());
      const l = Math.min(...rs.map((r) => r.left)), r = Math.max(...rs.map((r) => r.right));
      const t = Math.min(...rs.map((r) => r.top)), b = Math.max(...rs.map((r) => r.bottom));
      const p = (r - l) * 0.15, x = Math.max(0, l - p), y = Math.max(0, t - (b - t) * 0.9);
      return { x, y, width: Math.min(innerWidth, r + p) - x, height: Math.min(innerHeight, b + p) - y, vw: innerWidth, vh: innerHeight };
    }, route);
  await scene("hop", [{ space: a, mode: "3d", seat: "p1" }], [{ space: a, mode: "3d", seat: "p1", path: route, durationSec: 4 * 0.35 }], 2200, routeBox);

  // attack: face each other, lunge + recoil on the panel clock, flinch at the arc's landing.
  const facing = [
    { space: a, mode: "3d", seat: "p1", motion: { faceSpace: b } },
    { space: b, mode: "3d", seat: "p2", motion: { faceSpace: a } },
  ];
  await scene(
    "attack",
    facing,
    [
      { ...facing[0], motion: { faceSpace: b, lunge: { key: "c1", delayMs: STRIKE_DELAY, durMs: LUNGE } } },
      {
        ...facing[1],
        motion: { faceSpace: a, recoil: { key: "c1", delayMs: CONTACT, durMs: REACT, strength: 1.16 }, flinch: null },
      },
    ],
    ARC_LANDS + 100
  );
  // (the flinch lands with the arc: a second cue on the same, still-mounted pieces)
  {
    const stop = await record(page, cdp, path.join(base, "flinch"), SLOW !== 1 ? results.attack.box : null);
    await probe(page, [facing[0], { ...facing[1], motion: { faceSpace: a, flinch: { key: "fx-1" } } }]);
    await page.waitForTimeout(real(700));
    const { frames, poses } = await stop();
    fs.writeFileSync(path.join(base, "flinch.json"), JSON.stringify(poses));
    results.flinch = { frames, pose: summarise(poses) };
  }

  // defeat: the defender (still facing the attacker) topples.
  await scene("defeat", facing, [facing[0], { ...facing[1], motion: { faceSpace: a, topple: { key: "ko" } } }], 1300);

  // lift: selected.
  await scene("lift", [{ space: a, mode: "3d", seat: "p1" }], [{ space: a, mode: "3d", seat: "p1", motion: { held: true } }], 500);

  // drop: a mini appears.
  await scene("drop", null, [{ space: a, mode: "3d", seat: "p1", motion: { dropIn: true } }], 900);

  await probe(page, []);
  fs.writeFileSync(path.join(base, "motion.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  await browser.close();
};
