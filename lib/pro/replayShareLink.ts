/**
 * "Copy share link" as one action (#698): upload the bundle, then put the
 * public `/share/replay/<uuid>` URL on the clipboard.
 *
 * Both places a player reaches for a link — the win screen and a row in the
 * replays browser — go through here, so the wording, the failure statuses and
 * the clipboard handling can't drift apart. Everything a caller needs to render
 * comes back in the outcome; nothing here throws.
 *
 * Since #701 the upload also freezes the expansion in (see replayFrames.ts): ask
 * the engine for the God-view steps ONCE, here, while the versions still line up,
 * and ship them with the bundle so the link keeps rendering after the engine has
 * moved on. Best-effort by design — a refused or unreachable engine costs the
 * frames, never the share.
 */
import type { ReplayBundle } from "./protocol";
import { fetchReplayExpansion } from "./replayApi";
import { CloudFailureReason, uploadReplay } from "./replayCloud";
import { framesFromExpansion, type ReplayFrames } from "./replayFrames";
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
  | {
      ok: true;
      url: string;
      title: string;
      description: string;
      /** Whether the stored copy carries its own frames (see replayFrames.ts). */
      framesIncluded: boolean;
    }
  | {
      ok: false;
      reason: CloudFailureReason;
      title: string;
      description: string;
      /** A refusal the user can act on is a warning; the rest are errors. */
      status: "warning" | "error";
    };

/**
 * The expansion to freeze into the upload, or null if there isn't one to be had.
 * A truncated (diverged) expansion is still worth embedding — the frames carry
 * their own verification block, so the recipient sees the same honest "stops
 * early" banner the uploader saw.
 */
async function framesFor(bundle: ReplayBundle): Promise<ReplayFrames | null> {
  const expanded = await fetchReplayExpansion(bundle);
  if (!expanded.ok || expanded.expansion.steps.length === 0) return null;
  return framesFromExpansion(bundle, expanded.expansion);
}

/**
 * Upload `bundle` (titled with its own label unless one is passed) and copy the
 * resulting share URL. The local copy is untouched — uploading only mints an
 * extra, shareable one.
 */
export async function shareReplayLink(
  bundle: ReplayBundle,
  title?: string | null,
): Promise<ShareLinkOutcome> {
  const frames = await framesFor(bundle);
  const res = await uploadReplay({ bundle, title: title ?? replayLabel(bundle), frames });
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
    framesIncluded: res.framesIncluded,
  };
}
