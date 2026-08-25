/**
 * Import / export / share helpers for replay bundles (#122).
 *
 * Discord sizing: a full bundle (~20–34 KB) blows the 2000-char message limit but
 * is trivial as a FILE ATTACHMENT (25 MB ceiling). So the primary share path is a
 * .json download; "copy compact code" is offered only behind a length guard that
 * falls back to "too long — use the file".
 */
import type { ReplayBundle } from "./protocol";
import { stripFrames } from "./replayFrames";
import { replayHeroList } from "./replayHeroes";

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
  return assertBundle(parsed);
}

/**
 * The same structural gate as parseBundle, for a value that arrived already
 * parsed (a share-link payload — see lib/pro/replayCloud.ts). Throws with a
 * readable message on a bad shape; the authoritative check is still the
 * server's /replay.
 */
export function assertBundle(parsed: unknown): ReplayBundle {
  if (!parsed || typeof parsed !== "object") throw new Error("A bundle must be a JSON object.");
  const b = parsed as Partial<ReplayBundle>;
  if (b.v !== 1) throw new Error("Unrecognized bundle version (expected v1).");
  if (!b.config || !b.actionLog || !b.meta || !b.engine) {
    throw new Error("This JSON is missing bundle fields (config / actionLog / meta / engine).");
  }
  if (!Array.isArray(b.actionLog)) throw new Error("Bundle actionLog must be an array.");
  return parsed as ReplayBundle;
}

/** Minified single-line JSON — the "compact code" for a quick paste-share.
 * Frames (#701) are stripped for the same reason the .json export drops them. */
export function compactCode(bundle: ReplayBundle): string {
  return JSON.stringify(stripFrames(bundle));
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

/** Title-cased hero id ('king-kong' → 'King Kong'), shared by every replay label. */
const heroName = (heroId: string) =>
  heroId
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

/**
 * Human-readable label for a bundle ("King Kong vs Bigfoot — Blackwood Forest").
 * Used as the default title when uploading a replay to the cloud (#567) and as
 * the heading on the public share landing page.
 */
export function replayLabel(bundle: ReplayBundle): string {
  const heroes = replayHeroList(bundle.meta.heroes).map(heroName);
  const matchup = heroes.length ? heroes.join(" vs ") : "Unbrewed Pro match";
  const map = bundle.meta.mapTitle;
  return map ? `${matchup} — ${map}` : matchup;
}

/** A stable, human-readable filename for a bundle's .json download. */
export function bundleFilename(bundle: ReplayBundle): string {
  const heroes = replayHeroList(bundle.meta.heroes);
  const day = new Date(bundle.meta.endedAt || Date.now()).toISOString().slice(0, 10);
  return `unbrewed-replay-${heroes.join("-vs-")}-${day}.json`;
}

/**
 * Trigger a browser download of the bundle as pretty-printed JSON.
 *
 * Frozen frames (#701) are stripped: an exported file is re-imported through the
 * engine's /replay like any other, so the frames would be a few hundred KB of
 * dead weight in something a player pastes into Discord.
 */
export function downloadBundle(bundle: ReplayBundle): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([JSON.stringify(stripFrames(bundle), null, 2)], { type: "application/json" });
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
