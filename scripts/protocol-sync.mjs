#!/usr/bin/env node
// lib/pro/protocol.ts = engine protocol/protocol.ts @ pinned ref + lib/pro/protocol.overrides.mjs.
//
//   node scripts/protocol-sync.mjs sync <engine-ref-or-path>   regenerate protocol.ts + protocol.pin.json
//   node scripts/protocol-sync.mjs check [--engine <ref-or-path>]
//
// check (offline, runs in `npm test`): reverse the overrides on the committed file and compare the
// result's sha256 with the pin — fails if any mirrored line (or an override) was hand-edited.
// With --engine, also regenerate from that engine source and compare byte-for-byte (verifies the pin).
//
// <engine-ref-or-path>: a path to a protocol.ts file, to an engine checkout, or a git ref (resolved in
// ENGINE_REPO, default ../unbrewed-pro-server relative to the repo's main checkout, else a sibling).

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = path.join(root, "lib/pro/protocol.ts");
const PIN = path.join(root, "lib/pro/protocol.pin.json");
const OVERRIDES = path.join(root, "lib/pro/protocol.overrides.mjs");
const ENGINE_FILE = "protocol/protocol.ts";

const sha = (s) => createHash("sha256").update(s).digest("hex");
const count = (hay, needle) => hay.split(needle).length - 1;
const fail = (msg) => {
  console.error(`protocol: ${msg}`);
  process.exit(1);
};

async function loadOverrides() {
  const { default: ops } = await import(pathToFileURL(OVERRIDES).href);
  ops.forEach((o, i) => {
    if (!o.reason || typeof o.find !== "string" || typeof o.with !== "string")
      fail(`override #${i} needs { reason, find, with }`);
  });
  return ops;
}

function applyOverrides(engine, ops) {
  let out = engine;
  for (const o of ops) {
    if (count(out, o.find) !== 1) fail(`override "${o.reason}": \`find\` must match exactly once in the engine file (matches: ${count(out, o.find)})`);
    out = out.replace(o.find, () => o.with);
  }
  return out;
}

function reverseOverrides(generated, ops) {
  let out = generated;
  for (const o of [...ops].reverse()) {
    if (count(out, o.with) !== 1) return { error: `override "${o.reason}" is missing or edited in lib/pro/protocol.ts` };
    out = out.replace(o.with, () => o.find);
  }
  return { out };
}

function engineRepoDir() {
  if (process.env.ENGINE_REPO) return process.env.ENGINE_REPO;
  const common = execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd: root, encoding: "utf8" }).trim();
  const main = path.dirname(path.resolve(root, common)); // the p2p main checkout
  return path.join(path.dirname(main), "unbrewed-pro-server");
}

// Returns { source, ref } for a path or git ref.
function readEngine(spec) {
  if (existsSync(spec)) {
    const file = statSync(spec).isDirectory() ? path.join(spec, ENGINE_FILE) : spec;
    return { source: readFileSync(file, "utf8"), ref: null };
  }
  const repo = engineRepoDir();
  if (!existsSync(repo)) fail(`engine repo not found at ${repo} (set ENGINE_REPO), and "${spec}" is not a path`);
  const git = (...a) => execFileSync("git", a, { cwd: repo, encoding: "utf8", maxBuffer: 64 << 20 });
  let rev;
  try {
    rev = git("rev-parse", "--verify", `origin/${spec}^{commit}`).trim();
  } catch {
    try {
      rev = git("rev-parse", "--verify", `${spec}^{commit}`).trim();
    } catch {
      fail(`cannot resolve engine ref "${spec}" in ${repo} (try \`git fetch\` there)`);
    }
  }
  return { source: git("show", `${rev}:${ENGINE_FILE}`), ref: rev };
}

const [cmd, ...rest] = process.argv.slice(2);
const ops = await loadOverrides();

if (cmd === "sync") {
  if (!rest[0]) fail("usage: protocol:sync -- <engine-ref-or-path>");
  const { source, ref } = readEngine(rest[0]);
  const prev = existsSync(PIN) ? JSON.parse(readFileSync(PIN, "utf8")) : {};
  writeFileSync(TARGET, applyOverrides(source, ops));
  writeFileSync(
    PIN,
    JSON.stringify({ engineRepo: "JollyGrin/unbrewed-pro-server", ref: ref ?? prev.ref ?? null, engineSha256: sha(source) }, null, 2) + "\n",
  );
  console.log(`protocol: wrote lib/pro/protocol.ts from ${ref ?? rest[0]} (+${ops.length} overrides); pin updated`);
} else if (cmd === "check") {
  const pin = JSON.parse(readFileSync(PIN, "utf8"));
  const committed = readFileSync(TARGET, "utf8");
  const rev = reverseOverrides(committed, ops);
  if (rev.error) fail(`${rev.error}. Edit the overrides file and run \`npm run protocol:sync -- <ref>\`, don't hand-edit protocol.ts.`);
  if (sha(rev.out) !== pin.engineSha256)
    fail(
      `lib/pro/protocol.ts differs from engine ${pin.ref ?? ""} + overrides (a mirrored line was edited by hand, or the pin is stale). ` +
        `Fix the engine, or re-run \`npm run protocol:sync -- <engine-ref>\`.`,
    );
  const i = rest.indexOf("--engine");
  if (i >= 0) {
    const spec = rest[i + 1] ?? pin.ref;
    const { source } = readEngine(spec);
    if (sha(source) !== pin.engineSha256) fail(`engine ${spec} does not match the pin (${pin.ref}); re-sync or update the pin`);
    if (applyOverrides(source, ops) !== committed) fail("regenerated file differs from lib/pro/protocol.ts");
  }
  console.log(`protocol: ok (engine ${pin.ref ? pin.ref.slice(0, 9) : "?"} + ${ops.length} overrides)`);
} else {
  fail("usage: protocol-sync.mjs sync <engine-ref-or-path> | check [--engine <ref-or-path>]");
}
