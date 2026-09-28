#!/usr/bin/env node
/**
 * poster.mjs — turns a rendered promo clip into changelog media: a video
 * (copied, or re-encoded when it's too big) and a poster frame. Does NOT
 * upload anywhere — the changelog CDN isn't set up yet — it only writes
 * local files and prints the URLs they'll have once NEXT_PUBLIC_CHANGELOG_
 * MEDIA_URL points somewhere real (see lib/changelog/media.ts).
 *
 * Usage:
 *   node scripts/changelog/poster.mjs <slug> [options]
 *
 * Reads <promos>/<slug>-discord.mp4, falling back to <promos>/<slug>.mp4.
 *
 * Options:
 *   --promos <dir>   Promo folder to read from.
 *                    Default: /Users/grins/git/unbrewed/deck-promos
 *   --out <dir>      Output folder to write into.
 *                    Default: .changelog-media/changelog/ (git-ignored)
 *   -h, --help       Show this help.
 *
 * Requires ffmpeg on PATH. The poster is a WebP; on a machine whose ffmpeg
 * build has no WebP encoder, falls back to `cwebp` (brew install webp) if
 * that's on PATH instead.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, copyFileSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");

const DEFAULT_PROMOS = "/Users/grins/git/unbrewed/deck-promos";
const DEFAULT_OUT = join(REPO_ROOT, ".changelog-media", "changelog");
const MAX_COPY_BYTES = 8 * 1024 * 1024; // above this, re-encode instead of copying
const POSTER_SECOND = 1;
const POSTER_WIDTH = 1280;

function usage() {
  console.log(`Usage: node scripts/changelog/poster.mjs <slug> [options]

Reads <promos>/<slug>-discord.mp4 (falling back to <promos>/<slug>.mp4) and
writes <out>/<slug>.mp4 and <out>/<slug>-poster.webp. Does not upload
anywhere. Requires ffmpeg.

Options:
  --promos <dir>   Promo folder to read from. Default: ${DEFAULT_PROMOS}
  --out <dir>      Output folder to write into. Default: ${DEFAULT_OUT}
  -h, --help       Show this help.`);
}

function die(message) {
  console.error(`poster: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { slug: null, promos: DEFAULT_PROMOS, out: DEFAULT_OUT, help: false };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") opts.help = true;
    else if (arg === "--promos") opts.promos = argv[++i];
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
  const discord = join(promos, `${slug}-discord.mp4`);
  const plain = join(promos, `${slug}.mp4`);
  if (existsSync(discord)) return discord;
  if (existsSync(plain)) return plain;
  die(`no video found for "${slug}" — checked ${discord} and ${plain}`);
}

function writeVideo(source, dest) {
  const size = statSync(source).size;
  if (size <= MAX_COPY_BYTES) {
    copyFileSync(source, dest);
    return { size, reencoded: false };
  }
  const result = run("ffmpeg", [
    "-y",
    "-i",
    source,
    "-vf",
    "scale=-2:720",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "23",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    dest,
  ]);
  if (result.status !== 0) {
    die(`ffmpeg re-encode failed: ${(result.stderr ?? "").trim()}`);
  }
  return { size: statSync(dest).size, reencoded: true };
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

  const base = process.env.NEXT_PUBLIC_CHANGELOG_MEDIA_URL?.replace(/\/+$/, "") ?? "$NEXT_PUBLIC_CHANGELOG_MEDIA_URL";

  console.log(`source: ${source}`);
  console.log(`video:  ${videoOut} (${mb(video.size)}${video.reencoded ? ", re-encoded to 720p" : ", copied"})`);
  console.log(`poster: ${posterOut} (${mb(posterSize)})`);
  console.log(`video url:  ${base}/changelog/${opts.slug}.mp4`);
  console.log(`poster url: ${base}/changelog/${opts.slug}-poster.webp`);
}

main();
