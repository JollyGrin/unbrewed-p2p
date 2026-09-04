/**
 * Builds a prefilled GitHub "new issue" URL for submitting a community map to
 * unbrewed-p2p. Used by the submit-map dialog behind the /dev/map-editor
 * "submit" button and the in-game "submit this map" link (custom board).
 *
 * The map JSON is embedded in a fenced block when the resulting URL stays under
 * a safe length; otherwise the body leads with a `PASTE_YOUR_MAP_HERE` fence the
 * author replaces with what the dialog put on their clipboard. That paste path
 * is the COMMON one — anything past ~25 spaces blows the URL budget — so the
 * body is written for it first: paste target above the fold, details below
 * (issue #756; five community maps arrived with the old placeholder untouched).
 */

import type { ProMapDef } from "./protocol";

const REPO = "JollyGrin/unbrewed-p2p";
/** GitHub accepts long query strings, but keep a safe ceiling for browsers/proxies. */
const MAX_URL_LEN = 7500;

/** The literal the author selects and pastes over. Also named in the checklist. */
export const PASTE_TOKEN = "PASTE_YOUR_MAP_HERE";

export interface MapSubmissionIssue {
  /** Prefilled GitHub new-issue URL. */
  url: string;
  /** True when the map JSON rode along in the URL — no paste step needed. */
  embedded: boolean;
}

const buildUrl = (title: string, body: string): string =>
  `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;

const buildBody = (map: ProMapDef, json: string | null): string => {
  const embedded = json !== null;
  return [
    `## Map submission: ${map.meta.title || "Untitled map"}`,
    "",
    embedded
      ? "**Your map is included below.**"
      : "**Step 1 — paste your map.** Click on the line below, select it, and press Ctrl/Cmd+V to replace it with the map you copied.",
    "",
    "```json",
    json ?? PASTE_TOKEN,
    "```",
    "",
    embedded ? "**Confirm**" : "**Step 2 — confirm**",
    ...(embedded ? [] : [`- [ ] I replaced ${PASTE_TOKEN} above with my map`]),
    "- [ ] The board image URL below is public (renders for both players)",
    "- [ ] I playtested this map on /pro/game",
    "",
    "### Details",
    `- **Title:** ${map.meta.title || "(none)"}`,
    `- **Spaces:** ${map.spaces.length}`,
    `- **Board image URL:** ${map.meta.imageUrl || "⚠️ none — add a public image URL so it renders for both players"}`,
    `- **Source / credit:** ${map.meta.source || "(none)"}`,
    `- **License:** ${map.meta.license || "(none)"}`,
    "",
  ].join("\n");
};

/**
 * The prefilled issue plus whether the JSON made it into the URL. The submit
 * dialog branches on `embedded`: false = "copy, then paste on GitHub".
 */
export function mapSubmissionIssue(map: ProMapDef, json?: string): MapSubmissionIssue {
  // The `[map]` prefix is load-bearing: the orchestrator and future automation key on it.
  const title = `[map] ${map.meta.title || "Untitled map"}`;
  if (json) {
    const url = buildUrl(title, buildBody(map, json));
    if (url.length <= MAX_URL_LEN) return { url, embedded: true };
  }
  return { url: buildUrl(title, buildBody(map, null)), embedded: false };
}

/** URL-only convenience for callers that don't care how the JSON got there. */
export function mapSubmissionIssueUrl(map: ProMapDef, json?: string): string {
  return mapSubmissionIssue(map, json).url;
}
