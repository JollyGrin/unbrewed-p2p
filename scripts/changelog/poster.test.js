/**
 * poster.mjs shells out to ffmpeg, aws and curl, so these tests put fake
 * executables first on PATH. Each fake appends its argv (JSON, one line) to a
 * shared log; the fake ffmpeg also writes a small file to its last argument,
 * and the fake `aws s3 ls` reports an existing key when EXISTING_KEYS lists it.
 * No real credentials or network are touched.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const SCRIPT = path.join(__dirname, "poster.mjs");

const FAKE = (name) => `#!/usr/bin/env node
const fs = require("fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ bin: ${JSON.stringify(name)}, args }) + "\\n");
if (${JSON.stringify(name)} === "ffmpeg") {
  if (args[0] === "-version") process.exit(0);
  fs.writeFileSync(args[args.length - 1], Buffer.alloc(1024));
}
if (${JSON.stringify(name)} === "aws" && args.includes("ls")) {
  const key = args[args.length - 1].split("/").pop();
  if ((process.env.EXISTING_KEYS || "").split(",").includes(key)) console.log("2026-09-29 00:00:00 1024 " + key);
  else process.exit(1);
}
if (${JSON.stringify(name)} === "curl") process.stdout.write("200 1024");
`;

const setup = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "changelog-poster-test-"));
  const bin = path.join(root, "bin");
  const promos = path.join(root, "promos");
  const out = path.join(root, "out");
  fs.mkdirSync(bin);
  fs.mkdirSync(promos);
  for (const n of ["ffmpeg", "aws", "curl"]) {
    fs.writeFileSync(path.join(bin, n), FAKE(n));
    fs.chmodSync(path.join(bin, n), 0o755);
  }
  const log = path.join(root, "log.jsonl");
  fs.writeFileSync(log, "");
  const run = (args, env = {}) =>
    spawnSync("node", [SCRIPT, ...args, "--promos", promos, "--out", out], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, FAKE_LOG: log, ...env },
    });
  const calls = () =>
    fs
      .readFileSync(log, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  return { root, promos, run, calls };
};

describe("changelog poster.mjs", () => {
  let t;
  beforeEach(() => {
    t = setup();
    fs.writeFileSync(path.join(t.promos, "demo.mp4"), "master");
    fs.writeFileSync(path.join(t.promos, "demo-discord.mp4"), "discord");
  });
  afterEach(() => fs.rmSync(t.root, { recursive: true, force: true }));

  it("always re-encodes from the master with the pinned ffmpeg settings", () => {
    const res = t.run(["demo"]);
    expect(res.status).toBe(0);
    const enc = t.calls().find((c) => c.bin === "ffmpeg" && c.args.includes("libx264"));
    expect(enc.args).toEqual(
      expect.arrayContaining(["-i", path.join(t.promos, "demo.mp4"), "-preset", "slow", "-crf", "26", "-pix_fmt", "yuv420p", "-b:a", "96k", "-movflags", "+faststart"]),
    );
    expect(enc.args).toContain("scale=-2:'min(720,ih)'");
    expect(t.calls().some((c) => c.bin === "aws")).toBe(false);
  });

  it("falls back to -discord.mp4 only when the master is missing", () => {
    fs.rmSync(path.join(t.promos, "demo.mp4"));
    const res = t.run(["demo"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("demo-discord.mp4");
  });

  it("uploads mp4 and poster with content types and immutable cache headers", () => {
    const res = t.run(["demo", "--upload"]);
    expect(res.status).toBe(0);
    const cps = t.calls().filter((c) => c.bin === "aws" && c.args.includes("cp"));
    expect(cps).toHaveLength(2);
    expect(cps[0].args).toEqual(expect.arrayContaining(["--profile", "unbrewed-cdn", "s3://unbrewed-cdn/changelog/demo.mp4", "video/mp4", "public, max-age=31536000, immutable"]));
    expect(cps[1].args).toEqual(expect.arrayContaining(["s3://unbrewed-cdn/changelog/demo-poster.webp", "image/webp"]));
    expect(res.stdout).toContain("200 1024");
  });

  it("refuses to overwrite an existing key without --force", () => {
    const res = t.run(["demo", "--upload"], { EXISTING_KEYS: "demo.mp4" });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("already exist");
    expect(t.calls().some((c) => c.bin === "aws" && c.args.includes("cp"))).toBe(false);
  });

  it("overwrites an existing key with --force", () => {
    const res = t.run(["demo", "--upload", "--force"], { EXISTING_KEYS: "demo.mp4" });
    expect(res.status).toBe(0);
    expect(t.calls().filter((c) => c.bin === "aws" && c.args.includes("cp"))).toHaveLength(2);
  });
});
