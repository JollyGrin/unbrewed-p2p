#!/usr/bin/env node
/**
 * poster.mjs — turns a rendered promo master into changelog media: a 720p
 * re-encoded video and a poster frame, written locally. With --upload it
 * also pushes both to the changelog CDN (public R2 bucket behind
 * https://cdn.unbrewed.xyz) via the `aws` CLI (see lib/changelog/media.ts
 * for the URL convention).
 *
 * Usage:
 *   node scripts/changelog/poster.mjs <slug> [options]
 *
 * Reads the master <promos>/<slug>.mp4, falling back to
 * <promos>/<slug>-discord.mp4 only if the master is missing. Always
 * re-encodes (720p max, crf 26) so the CDN copy stays small.
 *
 * Options:
 *   --promos <dir>   Promo folder to read from.
 *                    Default: /Users/grins/git/unbrewed/deck-promos
 *   --out <dir>      Output folder to write into.
 *                    Default: .changelog-media/changelog/ (git-ignored)
 *   --upload         After encoding, `aws --profile unbrewed-cdn s3 cp` both
 *                    files to s3://unbrewed-cdn/changelog/ (immutable cache
 *                    headers), then curl the public URL. Refuses to overwrite
 *                    an existing key unless --force. Credentials come from
 *                    the aws profile; this script never reads them.
 *   --force          With --upload, overwrite keys that already exist.
 *   -h, --help       Show this help.
 *
 * Requires ffmpeg on PATH (and aws + curl for --upload). The poster is a WebP; on a machine whose ffmpeg
 * build has no WebP encoder, falls back to `cwebp` (brew install webp) if
 * that's on PATH instead.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");

const DEFAULT_PROMOS = "/Users/grins/git/unbrewed/deck-promos";
const DEFAULT_OUT = join(REPO_ROOT, ".changelog-media", "changelog");
const WARN_VIDEO_BYTES = 6 * 1024 * 1024;
const AWS_PROFILE = "unbrewed-cdn";
const BUCKET_PREFIX = "s3://unbrewed-cdn/changelog";
const CDN_BASE = "https://cdn.unbrewed.xyz";
const CACHE_CONTROL = "public, max-age=31536000, immutable";
const POSTER_SECOND = 1;
const POSTER_WIDTH = 1280;

function usage() {
  console.log(`Usage: node scripts/changelog/poster.mjs <slug> [options]

Reads the master <promos>/<slug>.mp4 (falling back to <slug>-discord.mp4 only
if the master is missing), always re-encodes it, and writes <out>/<slug>.mp4
and <out>/<slug>-poster.webp. Requires ffmpeg.

Options:
  --promos <dir>   Promo folder to read from. Default: ${DEFAULT_PROMOS}
  --out <dir>      Output folder to write into. Default: ${DEFAULT_OUT}
  --upload         Upload both files to s3://unbrewed-cdn/changelog/ via aws
                   (profile ${AWS_PROFILE}), then verify the public URL.
  --force          With --upload, overwrite keys that already exist.
  -h, --help       Show this help.`);
}

function die(message) {
  console.error(`poster: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { slug: null, promos: DEFAULT_PROMOS, out: DEFAULT_OUT, help: false, upload: false, force: false };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") opts.help = true;
    else if (arg === "--promos") opts.promos = argv[++i];
    else if (arg === "--upload") opts.upload = true;
    else if (arg === "--force") opts.force = true;
    else if (arg === "--out") opts.out = argv[++i];
    else if (arg.startsWith("--")) die(`unrecognized argument "${arg}" (see --help)`);
    else positional.push(arg);
  }
  opts.slug = positional[0] ?? null;
  return opts;
}

function run(bin, args) {
  return spawnSync(bin, args, { encoding: "utf8" });
}

function requireFfmpeg() {
  const check = run("ffmpeg", ["-version"]);
  if (check.error?.code === "ENOENT") {
    die("ffmpeg not found on PATH. Install it (brew install ffmpeg) and retry.");
  }
}

function resolveSource(promos, slug) {
  const master = join(promos, `${slug}.mp4`);
  const discord = join(promos, `${slug}-discord.mp4`);
  if (existsSync(master)) return master;
  if (existsSync(discord)) return discord;
  die(`no video found for "${slug}" — checked ${master} and ${discord}`);
}

function writeVideo(source, dest) {
  const result = run("ffmpeg", [
    "-y",
    "-i",
    source,
    "-vf",
    "scale=-2:'min(720,ih)'",
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "26",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "96k",
    "-movflags",
    "+faststart",
    dest,
  ]);
  if (result.status !== 0) {
    die(`ffmpeg encode failed: ${(result.stderr ?? "").trim()}`);
  }
  return { size: statSync(dest).size };
}

function writePoster(source, dest) {
  const scale = `scale=${POSTER_WIDTH}:-1`;
  const direct = run("ffmpeg", [
    "-y",
    "-ss",
    String(POSTER_SECOND),
    "-i",
    source,
    "-frames:v",
    "1",
    "-vf",
    scale,
    "-c:v",
    "libwebp",
    dest,
  ]);
  if (direct.status === 0) return;

  // This ffmpeg build has no WebP encoder — extract a PNG frame instead and
  // hand it to `cwebp` if that's available.
  const cwebpCheck = run("cwebp", ["-version"]);
  if (cwebpCheck.error?.code === "ENOENT") {
    die(
      "ffmpeg has no WebP encoder and cwebp is not on PATH. " +
        "Install libwebp (brew install webp) or an ffmpeg build with libwebp, then retry.",
    );
  }

  const tmpDir = mkdtempSync(join(tmpdir(), "changelog-poster-"));
  const framePng = join(tmpDir, "frame.png");
  try {
    const extract = run("ffmpeg", [
      "-y",
      "-ss",
      String(POSTER_SECOND),
      "-i",
      source,
      "-frames:v",
      "1",
      "-vf",
      scale,
      framePng,
    ]);
    if (extract.status !== 0) {
      die(`ffmpeg frame extraction failed: ${(extract.stderr ?? "").trim()}`);
    }
    const convert = run("cwebp", ["-q", "82", framePng, "-o", dest]);
    if (convert.status !== 0) {
      die(`cwebp conversion failed: ${(convert.stderr ?? "").trim()}`);
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

function keyExists(key) {
  const res = run("aws", ["--profile", AWS_PROFILE, "s3", "ls", `${BUCKET_PREFIX}/${key}`]);
  if (res.error?.code === "ENOENT") die("aws CLI not found on PATH.");
  // `s3 ls` exits 1 with no output when nothing matches; any listing line is a hit.
  return res.status === 0 && (res.stdout ?? "").trim() !== "";
}

function upload(files, force) {
  if (!force) {
    const taken = files.filter((f) => keyExists(f.key)).map((f) => f.key);
    if (taken.length) {
      die(`${taken.join(", ")} already exist in ${BUCKET_PREFIX}/ — pass --force to overwrite`);
    }
  }
  for (const f of files) {
    const res = run("aws", [
      "--profile",
      AWS_PROFILE,
      "s3",
      "cp",
      f.path,
      `${BUCKET_PREFIX}/${f.key}`,
      "--content-type",
      f.type,
      "--cache-control",
      CACHE_CONTROL,
    ]);
    if (res.status !== 0) die(`aws upload of ${f.key} failed: ${(res.stderr ?? "").trim()}`);
    console.log(`uploaded: ${BUCKET_PREFIX}/${f.key}`);
  }
  for (const f of files) {
    const url = `${CDN_BASE}/changelog/${f.key}?cb=${Date.now()}`;
    const res = run("curl", ["-sS", "-o", "/dev/null", "-I", "-w", "%{http_code} %header{content-length}", url]);
    console.log(`check:    ${url} -> ${(res.stdout ?? "").trim() || (res.stderr ?? "").trim()}`);
  }
}

function mb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    usage();
    return;
  }
  if (!opts.slug) die("missing <slug> argument (see --help)");

  requireFfmpeg();

  const source = resolveSource(opts.promos, opts.slug);
  mkdirSync(opts.out, { recursive: true });

  const videoOut = join(opts.out, `${opts.slug}.mp4`);
  const posterOut = join(opts.out, `${opts.slug}-poster.webp`);

  const video = writeVideo(source, videoOut);
  writePoster(source, posterOut);
  const posterSize = statSync(posterOut).size;

  const base = process.env.NEXT_PUBLIC_CHANGELOG_MEDIA_URL?.replace(/\/+$/, "") || "https://cdn.unbrewed.xyz"; // optional override, default is the CDN

  console.log(`source: ${source}`);
  console.log(`video:  ${videoOut} (${mb(video.size)}, re-encoded)`);
  if (video.size > WARN_VIDEO_BYTES) {
    console.warn(`warning: video is ${mb(video.size)}, above the ${mb(WARN_VIDEO_BYTES)} target`);
  }
  console.log(`poster: ${posterOut} (${mb(posterSize)})`);
  console.log(`video url:  ${base}/changelog/${opts.slug}.mp4`);
  console.log(`poster url: ${base}/changelog/${opts.slug}-poster.webp`);

  if (opts.upload) {
    upload(
      [
        { key: `${opts.slug}.mp4`, path: videoOut, type: "video/mp4" },
        { key: `${opts.slug}-poster.webp`, path: posterOut, type: "image/webp" },
      ],
      opts.force,
    );
  }
}

main();
