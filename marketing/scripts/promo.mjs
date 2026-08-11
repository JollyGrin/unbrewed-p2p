#!/usr/bin/env node
// Render a deck promo and produce its Discord copy in one step.
//
//   npm run promo -- taranis     → out/taranis.mp4 + out/taranis-discord.mp4
//
// <slug> is the props file name in props/ (which is not necessarily the
// deckSlug inside it — props/thrall.json renders deck "pk1x").

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const slug = process.argv[2];
if (!slug) {
  console.error("usage: npm run promo -- <slug>   (a file name in props/)");
  process.exit(1);
}

const props = path.join("props", `${slug}.json`);
if (!existsSync(props)) {
  console.error(
    `promo: no ${props}. Copy an existing props file and fill it in.`,
  );
  process.exit(1);
}

const step = (bin, args) => {
  const { status } = spawnSync(bin, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (status !== 0) process.exit(status ?? 1);
};

step("npx", [
  "remotion",
  "render",
  "DeckAnnouncement",
  path.join("out", `${slug}.mp4`),
  `--props=${props}`,
]);
step("node", ["scripts/compress-discord.mjs", slug]);
