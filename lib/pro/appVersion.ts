/**
 * Build-time app identity, surfaced in bug reports (issue #87). Both values are
 * inlined at build by next.config.js `env`:
 * - version  ← package.json
 * - commit   ← NEXT_PUBLIC_COMMIT_SHA (CI passes github.sha) or a local `git`
 *              read, falling back to "dev" when neither is available.
 */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0";
export const APP_COMMIT = process.env.NEXT_PUBLIC_COMMIT_SHA || "dev";
