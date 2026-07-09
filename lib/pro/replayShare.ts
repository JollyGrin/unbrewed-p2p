/**
 * Import / export / share helpers for replay bundles (#122).
 *
 * Discord sizing: a full bundle (~20–34 KB) blows the 2000-char message limit but
 * is trivial as a FILE ATTACHMENT (25 MB ceiling). So the primary share path is a
 * .json download; "copy compact code" is offered only behind a length guard that
 * falls back to "too long — use the file".
 */
import type { ReplayBundle } from "./protocol";
import { replayDuelHeroPair } from "./replayHeroes";

// Discord's message body cap is 2000 chars; stay under it with headroom for the
// wrapping ``` fence a user typically adds.
export const DISCORD_INLINE_LIMIT = 1900;

/** Structural parse of untrusted JSON into a ReplayBundle. Cheap client-side
 * gate before the authoritative /replay validation — catches "this isn't even a
 * bundle" without a round-trip. Throws with a readable message on a bad shape. */
export function parseBundle(text: string): ReplayBundle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That isn't valid JSON.");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("A bundle must be a JSON object.");
  const b = parsed as Partial<ReplayBundle>;
  if (b.v !== 1) throw new Error("Unrecognized bundle version (expected v1).");
  if (!b.config || !b.actionLog || !b.meta || !b.engine) {
    throw new Error("This JSON is missing bundle fields (config / actionLog / meta / engine).");
  }
  if (!Array.isArray(b.actionLog)) throw new Error("Bundle actionLog must be an array.");
  return parsed as ReplayBundle;
}

/** Minified single-line JSON — the "compact code" for a quick paste-share. */
export function compactCode(bundle: ReplayBundle): string {
  return JSON.stringify(bundle);
}

export interface CompactCodeResult {
  code: string;
  length: number;
  tooLongForDiscord: boolean; // over DISCORD_INLINE_LIMIT → prefer the file
}

export function compactCodeInfo(bundle: ReplayBundle): CompactCodeResult {
  const code = compactCode(bundle);
  return { code, length: code.length, tooLongForDiscord: code.length > DISCORD_INLINE_LIMIT };
}

/** A stable, human-readable filename for a bundle's .json download. */
export function bundleFilename(bundle: ReplayBundle): string {
  const [h1, h2] = replayDuelHeroPair(bundle.meta.heroes);
  const day = new Date(bundle.meta.endedAt || Date.now()).toISOString().slice(0, 10);
  return `unbrewed-replay-${h1}-vs-${h2}-${day}.json`;
}

/** Trigger a browser download of the bundle as pretty-printed JSON. */
export function downloadBundle(bundle: ReplayBundle): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = bundleFilename(bundle);
  document.body.appendChild(a);
  a.click();
  a.remove();
  // revoke on the next tick so the click's navigation has consumed the URL
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Read a user-picked File as text (for the import "upload file" path). */
export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsText(file);
  });
}
