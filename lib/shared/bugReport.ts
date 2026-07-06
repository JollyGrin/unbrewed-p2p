/**
 * Shared plumbing for building a prefilled GitHub "Report bug" issue URL —
 * used by both the Pro reporter (lib/pro/bugReport.ts, issue #87) and the
 * Sandbox reporter (lib/sandbox/bugReport.ts, issue #127). Each caller owns
 * its own title/labels/body shape; this module only owns the two things that
 * must behave identically everywhere:
 * 1. The URL-length guard. GitHub caps a new-issue URL around ~8KB; browsers
 *    can be stricter. We shrink the log excerpt (oldest lines first), then —
 *    if that alone isn't enough — the description, until the whole URL fits.
 *    The full log never needs to fit: it rides along as a manually-attached
 *    CSV, so trimming inline lines never loses data.
 * 2. Line/timestamp formatting shared between both activity feeds.
 */

const REPO = "JollyGrin/unbrewed-p2p";
/** Keep the whole URL under this; GitHub rejects ~8KB+, browsers can be stricter. */
export const MAX_URL_LEN = 7500;

export const buildIssueUrl = (title: string, body: string, labels: string): string =>
  `https://github.com/${REPO}/issues/new?labels=${encodeURIComponent(labels)}&title=${encodeURIComponent(
    title
  )}&body=${encodeURIComponent(body)}`;

/** "12:03:41" from a ms epoch, or a placeholder when the timestamp is missing. */
export const clock = (ts?: number): string => (ts ? new Date(ts).toISOString().slice(11, 19) : "--:--:--");

export const csvCell = (value: string): string => `"${value.replace(/"/g, '""')}"`;

export interface BuildBugReportUrlParams {
  title: string;
  labels: string;
  description: string;
  /** Formatted, oldest-first log lines for the chosen window — shrunk from the end as needed. */
  excerptLines: string[];
  bodyFor: (excerptLines: string[], description: string) => string;
}

/**
 * Assemble title + body into a GitHub new-issue URL guaranteed under
 * MAX_URL_LEN. Starts with the full excerpt and shrinks it (dropping oldest
 * lines first) until the URL fits. If even zero excerpt lines overflow (a
 * pathological description), the description itself is truncated as a last
 * resort.
 */
export function buildBugReportUrl(params: BuildBugReportUrlParams): string {
  const { title, labels, description, excerptLines, bodyFor } = params;

  for (let take = excerptLines.length; take >= 0; take--) {
    const excerpt = excerptLines.slice(excerptLines.length - take);
    const url = buildIssueUrl(title, bodyFor(excerpt, description), labels);
    if (url.length <= MAX_URL_LEN) return url;
  }

  // Last resort: no excerpt still overflows → truncate the description.
  let desc = description;
  while (desc.length > 0) {
    desc = desc.slice(0, Math.floor(desc.length * 0.8));
    const url = buildIssueUrl(title, bodyFor([], `${desc}…`), labels);
    if (url.length <= MAX_URL_LEN) return url;
  }
  return buildIssueUrl(title, bodyFor([], "_(description omitted — too long to prefill)_"), labels);
}
