// Client-only edits applied on top of the engine's protocol/protocol.ts to produce lib/pro/protocol.ts.
// Read by scripts/protocol-sync.mjs (`npm run protocol:sync` / `protocol:check`). Everything NOT listed
// here is a verbatim engine mirror and must not be hand-edited — change it in the engine and re-sync.
//
// Each override: { reason, find, with }. `find` is an exact, unique string in the engine file; `with` is
// what replaces it (to insert, repeat the anchor inside `with`). `with` must also be unique in the output
// so the check can reverse the overrides and compare against the pinned engine hash.

export default [
  {
    reason: "Header: replace the engine's 'Copy VERBATIM' sync note with the generated-file flow.",
    find: ` * ## Sync procedure (docs/pro/tasks/T-015 in the public repo)
 * Any change here bumps PROTOCOL_VERSION. Copy this file VERBATIM to
 * \`unbrewed-p2p/lib/pro/protocol.ts\` and note the sync in both commit bodies.
 * This file must compile standalone in both repos: NO imports — the engine
 * shapes it mirrors (Action, PendingPrompt kinds, MapDef) are duplicated here
 * by hand and drift is caught by the type-level tests in
 * \`test/protocol.test.ts\` (this repo only).
`,
    with: ` * ## GENERATED FILE — do not hand-edit (unbrewed-p2p#1304)
 * This is the engine's \`protocol/protocol.ts\` (unbrewed-pro-server) at the ref pinned in
 * \`lib/pro/protocol.pin.json\`, plus the explicit client-only edits in \`lib/pro/protocol.overrides.mjs\`
 * (each carries a one-line reason: the wire pin, REMATCH_PROTOCOL_VERSION, ReplayVerification, notes).
 *
 *   npm run protocol:sync -- <engine-ref-or-path>   # regenerate (rewrites this file + the pin)
 *   npm run protocol:check                          # fail if this file != engine@pin + overrides
 *
 * To take an engine change: sync, review the diff, commit. To change a client-only piece: edit the
 * overrides file, then sync again. \`protocol:check\` runs in \`npm test\`. The file must compile
 * standalone (NO imports).
`,
  },
  {
    reason: "Wire pin: the client speaks MAIN's protocol 37 even when the engine file says 39; a re-sync never bumps it.",
    find: `export const PROTOCOL_VERSION = 39;`,
    with: `/**
 * CLIENT-ONLY PIN (p2p #880, #1201, #1301) — the engine's copy says \`PROTOCOL_VERSION = 39\`; this
 * client binds MAIN's pin, 37 (the version it speaks and sends on the wire). The server accepts
 * \`ACCEPTED_PROTOCOL_VERSIONS\` (below), so 37 is accepted by an adventure-lane and a main-lane engine
 * alike — \`protocol:check\` asserts it is a member. Newer engine
 * versions (v38 and on) ride into this file as TYPES ONLY: a re-sync NEVER bumps this number, and
 * only a client change that actually handles a new version may — keep this value when re-syncing.
 */
export const PROTOCOL_VERSION = 37;

/**
 * CLIENT-ONLY (p2p #880, revised #1201): \`REMATCH_PROTOCOL_VERSION\` is the lowest version the
 * rematch negotiation (v35, above) needs — the client's gate for offering it. Since engine #754 the
 * server accepts nothing below 35 from a prod client, so every bind is at \`PROTOCOL_VERSION\` and is
 * rematch-capable; the old "bind at 34, upgrade to 35" dance in lib/pro/wireVersion.ts is gone.
 * \`protocol:check\` asserts it is >= the engine's \`REMATCH_MIN_PROTOCOL\`.
 */
export const REMATCH_PROTOCOL_VERSION = 35;`,
  },
  {
    reason: "Client note: jevx3 selection is gated client-side (lib/pro/tierUnlock.ts).",
    find: `export type BotDifficulty =`,
    with: `/**
 * CLIENT-ONLY NOTE (unbrewed-p2p#933): \`jevx3\` is advertised only behind the engine's \`EXPOSE_JEV=1\`
 * switch. The client gates SELECTING it on the player's record vs Expert (or a build-time
 * allowlist) — see lib/pro/tierUnlock.ts. \`jev\` is not gated.
 */
export type BotDifficulty =`,
  },
  {
    reason: "ReplayVerification is a client-named alias (lib/pro/replayVerification.ts imports it); the engine inlines the union.",
    find: `  verification?: "exact" | "digest-verified" | "diverged";`,
    with: `  verification?: ReplayVerification;`,
  },
  {
    reason: "Client-only named export of the ReplayVerification union (see the entry above).",
    find: `  | "TOURNAMENTS_DISABLED" // server has no tournament secret configured
  | "SERVER_ERROR";
`,
    with: `  | "TOURNAMENTS_DISABLED" // server has no tournament secret configured
  | "SERVER_ERROR";

// CLIENT-ONLY named export (lib/pro/replayVerification.ts imports it).
export type ReplayVerification = "exact" | "digest-verified" | "diverged";
`,
  },
];
