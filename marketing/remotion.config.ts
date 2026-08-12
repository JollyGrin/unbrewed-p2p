/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import { Config } from "@remotion/cli/config";
import { enableTailwind } from '@remotion/tailwind-v4';

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.overrideWebpackConfig(enableTailwind);
// Card art is decoded on the same tabs that load the brand fonts, and a heavy
// deck can push a font fetch past the 30s default — which fails the whole
// render mid-way with a delayRender timeout. Give it room.
Config.setDelayRenderTimeoutInMilliseconds(180000);
