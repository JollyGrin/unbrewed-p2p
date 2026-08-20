/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { Config } from "@remotion/cli/config";
import { enableTailwind } from "@remotion/tailwind-v4";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
// The compositions import the app's real card renderer from outside this
// package, and those files use the app's own "@/…" alias. tsconfig.json maps it
// for `tsc`; webpack needs telling separately or the bundle fails to resolve
// `@/lib/pro/cardAppearance` (the cosmetics seam every card face goes through).
// Found by walking up from the working directory rather than from this file:
// the CLI evaluates the config with `eval`, so neither `__dirname` nor
// `import.meta.dirname` points anywhere near it. `components/CardFactory` is
// the thing being imported, so it is also the thing worth looking for.
const findAppRoot = () => {
  let dir = process.cwd();
  for (let up = 0; up < 6; up++) {
    if (existsSync(path.join(dir, "components", "CardFactory"))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error(
    "remotion.config.ts: could not find the app root (no components/CardFactory above " +
      process.cwd() +
      "). Run remotion from the marketing/ directory.",
  );
};

const APP_ROOT = findAppRoot();

Config.overrideWebpackConfig((config) =>
  enableTailwind({
    ...config,
    resolve: {
      ...config.resolve,
      alias: { ...config.resolve?.alias, "@": APP_ROOT },
    },
  }),
);
// Card art is decoded on the same tabs that load the brand fonts, and a heavy
// deck can push a font fetch past the 30s default — which fails the whole
// render mid-way with a delayRender timeout. Give it room.
Config.setDelayRenderTimeoutInMilliseconds(180000);
