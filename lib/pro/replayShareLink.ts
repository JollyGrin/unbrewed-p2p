/**
 * "Copy share link" as one action (#698): upload the bundle, then put the
 * public `/share/replay/<uuid>` URL on the clipboard.
 *
 * Both places a player reaches for a link — the win screen and a row in the
 * replays browser — go through here, so the wording, the failure statuses and
 * the clipboard handling can't drift apart. Everything a caller needs to render
 * comes back in the outcome; nothing here throws.
 */
import type { ReplayBundle } from "./protocol";
import { CloudFailureReason, uploadReplay } from "./replayCloud";
import { replayLabel } from "./replayShare";

/**
 * Best-effort clipboard write. A blocked, absent, or permission-denied
 * clipboard must not throw or reject into the console — the caller shows the
 * URL either way, so it can always be copied by hand.
 */
export const copyLink = (url: string): void => {
  try {
    void navigator.clipboard?.writeText(url)?.catch(() => {});
  } catch {
    /* ignore */
  }
};

export type ShareLinkOutcome =
  | { ok: true; url: string; title: string; description: string }
  | {
      ok: false;
      reason: CloudFailureReason;
      title: string;
      description: string;
      /** A refusal the user can act on is a warning; the rest are errors. */
      status: "warning" | "error";
    };

/**
 * Upload `bundle` (titled with its own label unless one is passed) and copy the
 * resulting share URL. The local copy is untouched — uploading only mints an
 * extra, shareable one.
 */
export async function shareReplayLink(
  bundle: ReplayBundle,
  title?: string | null,
): Promise<ShareLinkOutcome> {
  const res = await uploadReplay({ bundle, title: title ?? replayLabel(bundle) });
  if (!res.ok) {
    return {
      ok: false,
      reason: res.reason,
      title: res.reason === "cap_reached" ? "Cloud replays are full" : "Couldn't upload that replay",
      description: res.message,
      status: res.reason === "cap_reached" || res.reason === "too_large" ? "warning" : "error",
    };
  }
  copyLink(res.url);
  return {
    ok: true,
    url: res.url,
    title: "Share link copied",
    description: res.url,
  };
}
