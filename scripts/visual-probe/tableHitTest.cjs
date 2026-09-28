/**
 * Tabletop click routing — does a tap on a gold space commit THAT space?
 * (#873). jsdom cannot hit-test, and a tilted, perspective-projected board
 * with standees on top is exactly where "the box on top wins" goes wrong, so
 * this asks the real browser.
 *
 * For every gold pick on the board it samples the pick's visible centre, and
 * one point per nearby pick on its visible disc (70% of the way to the rim,
 * facing that neighbour), and resolves each sample to the click handler a tap
 * there would actually fire: the nearest ancestor of `elementFromPoint` with a
 * React `onClick`. A sample is
 *
 *   ok      the handler commits the pick itself (the space's own hit circle,
 *           or a piece standing on it — a piece forwards to its space);
 *   wrong   the handler commits a DIFFERENT space;
 *   dead    nothing fires (board art, a board object, a tail with no
 *           fallback, an item badge…).
 *
 * The game is a real one against the default engine: King Kong (a LARGE
 * fighter, so there is a tail on the board) vs Bot·E. It measures two prompts:
 * Kong's setup "place the tail" CHOOSE SPACE, and then a Maneuver's move picks.
 *
 * Usage (a dev server must already be running):
 *
 *   PW_PATH=~/.npm/_npx/<hash>/node_modules/playwright \
 *   PROBE_URL=http://localhost:3873 PROBE_MAP="Secluded Temple" \
 *     node scripts/visual-probe/tableHitTest.cjs --device desktop|phone [--out <dir>]
 *
 * `phone` is WebKit with Playwright's "iPhone 14 landscape" device (touch,
 * coarse pointer — the case the padded hit circles exist for); `desktop` is a
 * 1440×900 Chromium window with a mouse. Prints one JSON object per prompt.
 */
const path = require("path");
const fs = require("fs");

const PW_PATH = process.env.PW_PATH;
if (!PW_PATH) {
  console.error("Set PW_PATH to a playwright install (see the header comment).");
  process.exit(2);
}
const pw = require(PW_PATH);

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const DEVICE = arg("--device", "desktop");
const OUT = arg("--out", path.join(require("os").tmpdir(), "table-hit-test"));
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.PROBE_URL || "http://localhost:3000";
const PROBE_MAP = process.env.PROBE_MAP || "Secluded Temple";
/** How far out on the visible disc a neighbour-facing sample sits. */
const RIM_FRACTION = 0.7;
/** Neighbours farther than this many disc widths can't steal a tap. */
const NEIGHBOUR_RANGE = 3;

/** Runs in the page. */
const hitTest = ([rimFraction, neighbourRange]) => {
  const plane = document.querySelector("[data-table-stage-plane]");
  if (!plane) return { error: "tabletop view not mounted" };
  const reactProps = (el) => {
    const key = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
    return key ? el[key] : null;
  };
  const isSpaceRoot = (el) => el.hasAttribute("data-space-id") && el.hasAttribute("title") && !el.hasAttribute("data-fighter-base");
  // What a tap at (x, y) commits.
  const resolve = (x, y) => {
    const hit = document.elementFromPoint(x, y);
    for (let el = hit; el && el !== plane; el = el.parentElement) {
      if (!reactProps(el)?.onClick) continue;
      if (isSpaceRoot(el)) return { space: el.getAttribute("data-space-id"), via: "space" };
      if (el.closest("[data-space-badge]")) return { space: null, via: "badge" };
      const base = el.querySelector("[data-fighter-base][data-space-id]");
      if (base) return { space: base.getAttribute("data-space-id"), via: "piece" };
      const attrs = (n) => [...n.attributes].filter((a) => a.name.startsWith("data-") || a.name === "title").map((a) => `${a.name}=${a.value}`).join(" ");
      return { space: null, via: `handler:${el.tagName}[${attrs(el)}] hit:${hit.tagName}[${attrs(hit)}]` };
    }
    const data = hit ? [...hit.attributes].filter((a) => a.name.startsWith("data-")).map((a) => a.name.slice(5)) : [];
    const tag = hit ? `${hit.tagName}${data.length ? `[${data.join(",")}]` : ""}${hit === plane.parentElement ? "(camera)" : ""}` : "nothing";
    return { space: null, via: `dead:${tag}` };
  };

  const picks = [...plane.querySelectorAll("[data-pick][data-space-id]")].filter(isSpaceRoot).map((el) => {
    const r = el.firstElementChild.getBoundingClientRect();
    return { id: el.getAttribute("data-space-id"), cx: r.x + r.width / 2, cy: r.y + r.height / 2, rx: r.width / 2, ry: r.height / 2 };
  });

  const samples = [];
  for (const p of picks) {
    samples.push({ pick: p.id, at: "centre", x: p.cx, y: p.cy });
    for (const q of picks) {
      if (q === p) continue;
      const dx = q.cx - p.cx;
      const dy = q.cy - p.cy;
      const d = Math.hypot(dx, dy);
      if (!d || d > neighbourRange * 2 * Math.max(p.rx, q.rx)) continue;
      samples.push({ pick: p.id, at: `toward ${q.id}`, x: p.cx + (dx / d) * p.rx * rimFraction, y: p.cy + (dy / d) * p.ry * rimFraction });
    }
  }
  const results = samples.map((s) => ({ ...s, ...resolve(s.x, s.y) }));
  // Mark every sample for the screenshot that follows: green commits its own
  // pick, red another space, black nothing. Drawn after resolving, and inert.
  document.querySelectorAll("[data-hit-test-dot]").forEach((d) => d.remove());
  for (const r of results) {
    const dot = document.createElement("div");
    dot.setAttribute("data-hit-test-dot", "");
    const color = r.space === r.pick ? "#22c55e" : r.space ? "#ef4444" : "#111";
    Object.assign(dot.style, {
      position: "fixed", left: `${r.x - 4}px`, top: `${r.y - 4}px`, width: "8px", height: "8px",
      borderRadius: "50%", background: color, border: "1.5px solid #fff", zIndex: 99999, pointerEvents: "none",
    });
    document.body.appendChild(dot);
  }
  const ok = results.filter((r) => r.space === r.pick);
  const wrong = results.filter((r) => r.space && r.space !== r.pick);
  const dead = results.filter((r) => !r.space);
  const fmt = (r) => `${r.pick} ${r.at} → ${r.space ?? "-"} (${r.via})`;
  return {
    picks: picks.map((p) => p.id),
    samples: results.length,
    ok: ok.length,
    wrong: wrong.map(fmt),
    dead: dead.map(fmt),
  };
};

const tap = async (p, x, y) => (DEVICE === "phone" ? p.touchscreen.tap(x, y) : p.mouse.click(x, y));
const press = async (loc) => (DEVICE === "phone" ? loc.tap() : loc.click());
const bodyText = (p) => p.evaluate(() => document.body.innerText);
const pickIds = (p) => p.$$eval("[data-table-stage-plane] [data-pick][data-space-id][title]", (els) => els.map((e) => e.getAttribute("data-space-id")));

(async () => {
  const b = DEVICE === "phone" ? await pw.webkit.launch() : await pw.chromium.launch();
  const ctx = await b.newContext(DEVICE === "phone" ? pw.devices["iPhone 14 landscape"] : { viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.error("[page error]", e.message));

  await p.goto(`${BASE}/pro/game`);
  await p.waitForTimeout(6000);
  await press(p.getByRole("button", { name: "Bot·E", exact: true }));
  await press(p.getByRole("button", { name: /^King Kong by/ }).first());
  const stage = p.getByRole("button", { name: PROBE_MAP, exact: true });
  if (!(await stage.count())) {
    const more = p.getByRole("button", { name: /^All \d+ boards$/ });
    if (await more.count()) await press(more.first());
  }
  await press(stage.first());
  await press(p.getByRole("button", { name: "PLAY VS BOT" }));
  await p.waitForTimeout(12000);
  const keep = p.getByRole("button", { name: /keep your opening hand/i });
  if (await keep.count()) await press(keep);
  await p.waitForTimeout(3000);

  // Switch to the tabletop view.
  if (DEVICE === "phone") {
    await press(p.locator('[aria-label="Game menu"]').first());
    await p.waitForTimeout(500);
    await p.getByRole("menuitem", { name: /Board — /i }).evaluate((el) => el.click());
  } else {
    await press(p.getByRole("button", { name: "Flat board" }));
  }
  await p.waitForTimeout(3000);

  const report = { device: DEVICE, map: PROBE_MAP, prompts: {} };
  try {

    // 1. Kong's setup: place the tail.
    report.prompts.setup = await p.evaluate(hitTest, [RIM_FRACTION, NEIGHBOUR_RANGE]);
    await p.screenshot({ path: path.join(OUT, `${DEVICE}-setup.png`) });

    // Commit the first pick by tapping its visible centre (a live click check).
    const first = await p.$eval("[data-table-stage-plane] [data-pick][data-space-id][title]", (el) => {
      const r = el.firstElementChild.getBoundingClientRect();
      return { id: el.getAttribute("data-space-id"), x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await tap(p, first.x, first.y);
    report.setupCommit = { tapped: first.id };

    // 2. A maneuver: its move picks.
    const maneuver = p.getByRole("button", { name: /^\d*\s*maneuver/i });
    let ready = false;
    for (let t = 0; t < 120 && !ready; t++) {
      ready = (await maneuver.count()) > 0;
      if (!ready) await p.waitForTimeout(1000);
    }
    if (ready) {
      await press(maneuver.first());
      await p.waitForTimeout(1500);
      // Boost as far as the hand allows: a longer move lights up more gold
      // spaces, and more neighbouring picks is the case being measured.
      const boosts = p.getByRole("button", { name: /^\d*\s*Boost \+\d/i });
      const labels = await boosts.allInnerTexts();
      const best = labels.map((t, i) => [Number(/\+(\d+)/.exec(t)[1]), i]).sort((a, b) => b[0] - a[0])[0];
      if (best) {
        report.boost = labels[best[1]].replace(/\s+/g, " ");
        await press(boosts.nth(best[1]));
      }
      await p.waitForTimeout(1500);
      report.prompts.maneuver = await p.evaluate(hitTest, [RIM_FRACTION, NEIGHBOUR_RANGE]);
      report.tailSpace = await p
        .$eval('[data-fighter-id$="-tail"] [data-fighter-base]', (el) => el.getAttribute("data-space-id"))
        .catch(() => null);
      report.tailIsPick = !!report.tailSpace && report.prompts.maneuver.picks.includes(report.tailSpace);
      await p.screenshot({ path: path.join(OUT, `${DEVICE}-maneuver.png`) });

    // 3. Mid-walk: take one step, so the walk ghost stands on the board over
    // the next gold steps, and measure again.
    const step = await p.$eval("[data-table-stage-plane] [data-pick][data-space-id][title]", (el) => {
      const r = el.firstElementChild.getBoundingClientRect();
      return { id: el.getAttribute("data-space-id"), x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }).catch(() => null);
    if (step) {
      await tap(p, step.x, step.y);
      await p.waitForTimeout(1500);
      report.prompts.midWalk = await p.evaluate(hitTest, [RIM_FRACTION, NEIGHBOUR_RANGE]);
      report.midWalkStep = step.id;
      report.ghosts = await p.$$eval("[data-move-ghost]", (els) => els.map((e) => e.getAttribute("data-ghost-space-id")));
      await p.screenshot({ path: path.join(OUT, `${DEVICE}-mid-walk.png`) });
    }
    } else {
      report.prompts.maneuver = { error: "no Maneuver action appeared", text: (await bodyText(p)).slice(0, 600) };
    }

  } catch (e) {
    report.error = String(e.message || e).split("\n")[0];
  }
  console.log(JSON.stringify(report, null, 2));
  await b.close();
})();
