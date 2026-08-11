#!/usr/bin/env node
// Shrink a rendered promo into a Discord-safe upload.
//
//   node scripts/compress-discord.mjs taranis
//   node scripts/compress-discord.mjs out/taranis.mp4 --limit-mb 8
//
// Writes <name>-discord.mp4 next to the input: 720p, two-pass H.264 at a
// bitrate computed from the clip's own duration, AAC audio when the source has
// any. The size is VERIFIED after encoding and re-encoded lower if it missed,
// so the output is guaranteed under the limit rather than hopefully under it.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

const OUT_DIR = "out";
const DEFAULT_LIMIT_MB = 8; // Discord's free-tier attachment cap
const HEADROOM = 0.94; // container overhead + rate-control overshoot
const AUDIO_KBPS = 96;
const MIN_VIDEO_KBPS = 250;
const MAX_ATTEMPTS = 3;

const die = (message) => {
  console.error(`compress-discord: ${message}`);
  process.exit(1);
};

const run = (bin, args, { capture = false } = {}) => {
  const result = spawnSync(bin, args, {
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error?.code === "ENOENT") {
    die(
      `${bin} not found on PATH. Install it (brew install ffmpeg) and retry.`,
    );
  }
  if (result.status !== 0) {
    die(`${bin} exited ${result.status}${capture ? `\n${result.stderr}` : ""}`);
  }
  return result.stdout ?? "";
};

const probe = (file, args) =>
  run("ffprobe", ["-v", "error", ...args, "-of", "default=nw=1:nk=1", file], {
    capture: true,
  }).trim();

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(2);

// ---- args ----
const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? fallback : Number(argv[at + 1]);
};
const target = argv.find(
  (arg) => !arg.startsWith("--") && !Number.isFinite(Number(arg)),
);
if (!target) {
  die(
    "usage: node scripts/compress-discord.mjs <slug|path-to.mp4> [--limit-mb 8]",
  );
}

const limitMb = flag("limit-mb", DEFAULT_LIMIT_MB);
const input = target.endsWith(".mp4")
  ? target
  : path.join(OUT_DIR, `${target}.mp4`);
if (!existsSync(input)) {
  die(`no such file: ${input}. Render it first (npm run render:deck …).`);
}

const output = path.join(
  path.dirname(input),
  `${path.basename(input, ".mp4")}-discord.mp4`,
);
const limitBytes = limitMb * 1024 * 1024;

// ---- budget ----
const duration = Number(probe(input, ["-show_entries", "format=duration"]));
if (!Number.isFinite(duration) || duration <= 0) {
  die(`could not read a duration from ${input}`);
}
const hasAudio =
  probe(input, [
    "-select_streams",
    "a:0",
    "-show_entries",
    "stream=codec_type",
  ]) !== "";
const audioKbps = hasAudio ? AUDIO_KBPS : 0;

let videoKbps = Math.floor(
  (limitBytes * HEADROOM * 8) / duration / 1000 - audioKbps,
);
if (videoKbps < MIN_VIDEO_KBPS) {
  die(
    `${duration.toFixed(1)}s does not fit in ${limitMb}MB above ${MIN_VIDEO_KBPS}kbps — shorten the video.`,
  );
}

const passDir = mkdtempSync(path.join(tmpdir(), "promo-discord-"));
const passLog = path.join(passDir, "ffmpeg2pass");

// 720p box, and force even dimensions (x264 rejects odd ones). Using a box
// rather than a fixed 1280x720 keeps this correct if a vertical cut is added.
const SCALE =
  "scale=w=1280:h=720:force_original_aspect_ratio=decrease:flags=lanczos," +
  "scale=trunc(iw/2)*2:trunc(ih/2)*2";

const encode = (kbps) => {
  const common = [
    "-y",
    "-i",
    input,
    "-vf",
    SCALE,
    "-c:v",
    "libx264",
    "-b:v",
    `${kbps}k`,
    "-maxrate",
    `${Math.round(kbps * 1.35)}k`,
    "-bufsize",
    `${Math.round(kbps * 2)}k`,
    "-preset",
    "slow",
    "-pix_fmt",
    "yuv420p",
    "-passlogfile",
    passLog,
  ];
  run("ffmpeg", [
    ...common,
    "-pass",
    "1",
    "-an",
    "-f",
    "mp4",
    process.platform === "win32" ? "NUL" : "/dev/null",
  ]);
  run("ffmpeg", [
    ...common,
    "-pass",
    "2",
    ...(hasAudio ? ["-c:a", "aac", "-b:a", `${AUDIO_KBPS}k`] : ["-an"]),
    "-movflags",
    "+faststart",
    output,
  ]);
  return statSync(output).size;
};

try {
  let size = 0;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(
      `compress-discord: ${path.basename(input)} — ${duration.toFixed(1)}s @ ${videoKbps}kbps (attempt ${attempt})`,
    );
    size = encode(videoKbps);
    if (size <= limitBytes) break;
    if (attempt === MAX_ATTEMPTS) {
      die(
        `still ${mb(size)}MB after ${MAX_ATTEMPTS} attempts — raise --limit-mb or shorten the clip.`,
      );
    }
    // aim at what actually fit, not at the same guess again
    videoKbps = Math.floor((videoKbps * limitBytes * 0.92) / size);
  }
  console.log(
    `compress-discord: wrote ${output} (${mb(size)}MB, limit ${limitMb}MB)`,
  );
} finally {
  rmSync(passDir, { recursive: true, force: true });
}
