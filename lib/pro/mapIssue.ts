/**
 * Builds a prefilled GitHub "new issue" URL for submitting a community map to
 * unbrewed-p2p. Used by the /dev/map-editor "submit" button and the in-game
 * "submit this map" link (shown when playing on a custom board).
 *
 * The map JSON is embedded in a fenced block when the resulting URL stays under
 * a safe length; otherwise the body asks the author to paste it (GitHub/browser
 * URL length is bounded, and a board with many spaces can exceed it).
 */

import type { ProMapDef } from "./protocol";

const REPO = "JollyGrin/unbrewed-p2p";
/** GitHub accepts long query strings, but keep a safe ceiling for browsers/proxies. */
const MAX_URL_LEN = 7500;

const buildUrl = (title: string, body: string): string =>
  `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;

export function mapSubmissionIssueUrl(map: ProMapDef, json?: string): string {
  const title = `[map] ${map.meta.title || "Untitled map"}`;
  const header = [
    "## Map submission",
    "",
    `- **Title:** ${map.meta.title || "(none)"}`,
    `- **Spaces:** ${map.spaces.length}`,
    `- **Board image URL:** ${map.meta.imageUrl || "⚠️ none — add a public image URL so it renders for both players"}`,
    `- **Source / credit:** ${map.meta.source || "(none)"}`,
    `- **License:** ${map.meta.license || "(none)"}`,
    "",
    "### Checklist",
    "- [ ] The board image URL above is public (renders for both players)",
    "- [ ] I playtested this map on /pro/game",
    "",
    "### Map JSON",
    "",
  ].join("\n");

  if (json) {
    const withJson = buildUrl(title, `${header}\n\`\`\`json\n${json}\n\`\`\`\n`);
    if (withJson.length <= MAX_URL_LEN) return withJson;
  }
  return buildUrl(title, `${header}_Paste your exported map JSON here (it was too large to prefill)._\n`);
}
