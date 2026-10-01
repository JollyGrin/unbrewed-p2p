/**
 * Adventure board stakes (#1160): what standing next to an enclosure costs, and what came out
 * of the broken ones. Pure mapping from `PlayerView.scenario.contacts` / `.releases` (engine
 * #735) onto the enclosure badges, plus the chip placer that keeps the callouts off every
 * space (and so every fighter token — they sit on spaces).
 *
 * PRESENTATION ONLY. Absent `contacts` / `releases` ⇒ an empty stake map ⇒ today's badges.
 */
import { MARKER_IDENTITIES } from "./boardObjects";
import type { PlayerView, SpaceId } from "./protocol";

export const ADJACENT_CHIP = "+1 threat at round end";
export const NEXT_CHIP = "breaks next if the track fills";
export const TIE_CHIP = "tie — your team picks";

export interface EnclosureStake {
  /** The villain touches this closed enclosure: +1 threat at round end. */
  adjacent: boolean;
  /** The next overflow opens this one (or is a tie that includes it). */
  next: boolean;
  /** `next`, among 2+ candidates. */
  tie: boolean;
  /** Destroyed enclosure: the enemy it released. */
  release?: { name: string; glyph: string };
}

export type EnclosureStakes = Readonly<Record<SpaceId, EnclosureStake>>;

type ScenarioSlice = Pick<NonNullable<PlayerView["scenario"]>, "contacts" | "releases"> | null | undefined;

const glyphFor = (enemyId: string, name: string): string =>
  MARKER_IDENTITIES[enemyId]?.glyph ?? name.replace(/[^A-Za-z]/g, "").slice(0, 2);

export const enclosureStakes = (
  scenario: ScenarioSlice,
  fighters: readonly { id: string; name: string }[],
  blocked: ReadonlySet<SpaceId>,
  destroyed: ReadonlySet<SpaceId>,
  numbers: Readonly<Record<SpaceId, number>>
): EnclosureStakes => {
  const out: Record<SpaceId, EnclosureStake> = {};
  if (!scenario) return out;
  const contacts = scenario.contacts;
  if (contacts) {
    const adjacent = new Set(contacts.adjacent);
    const next = contacts.nextToOpen.filter((id) => blocked.has(id));
    for (const id of blocked) {
      const isAdj = adjacent.has(id);
      const isNext = next.includes(id);
      if (isAdj || isNext) out[id] = { adjacent: isAdj, next: isNext, tie: isNext && next.length > 1 };
    }
  }
  for (const r of scenario.releases ?? []) {
    const id =
      r.space && destroyed.has(r.space)
        ? r.space
        : [...destroyed].find((d) => r.spaceLabel != null && numbers[d] === Number(r.spaceLabel));
    if (!id) continue;
    const name = fighters.find((f) => f.id === r.fighter)?.name ?? r.enemyId;
    out[id] = { adjacent: false, next: false, tie: false, release: { name, glyph: glyphFor(r.enemyId, name) } };
  }
  return out;
};

/** Chip texts for one stake, in reading order. */
export const stakeChipText = (s: EnclosureStake): string[] => [
  ...(s.adjacent ? [ADJACENT_CHIP] : []),
  ...(s.next ? [s.tie ? TIE_CHIP : NEXT_CHIP] : []),
];

// ---- chip placement -------------------------------------------------------------------------

export const CHIP_LINE_PX = 11;
const CHIP_VPAD_PX = 6;
const CHIP_CHAR_PX = 6.2; // deliberately generous for 10px bold SpaceGrotesk
const CHIP_HPAD_PX = 12;
const CLEAR_PX = 3;
const MAX_PARTS = 3;

/** `text` broken into `parts` balanced lines at word boundaries (fewer if it has fewer words). */
export const wrapChip = (text: string, parts: number): string[] => {
  const words = text.split(" ");
  const n = Math.min(parts, words.length);
  if (n <= 1) return [text];
  const target = text.length / n;
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur && lines.length < n - 1 && (cur + " " + w).length > target + 2) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  lines.push(cur);
  return lines;
};

export interface ChipBlock {
  text: string;
  lines: string[];
  h: number;
}

export interface ChipRequest {
  id: SpaceId;
  /** Chip texts stacked in one block. */
  texts: readonly string[];
}

export interface ChipPlacement {
  /** Offset of the chip block's centre from its space's centre, px. */
  dx: number;
  dy: number;
  w: number;
  h: number;
  blocks: ChipBlock[];
}

interface Rect {
  l: number;
  t: number;
  r: number;
  b: number;
}

export const rectsOverlap = (a: Rect, b: Rect): boolean => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

/** Does a chip rect touch a space disc? (exact circle/rect test; the probe tests use it too) */
export const rectHitsCircle = (rc: Rect, cx: number, cy: number, rad: number): boolean => {
  const nx = Math.max(rc.l, Math.min(cx, rc.r));
  const ny = Math.max(rc.t, Math.min(cy, rc.b));
  return (nx - cx) ** 2 + (ny - cy) ** 2 < rad * rad;
};

const layoutBlocks = (texts: readonly string[], parts: number) => {
  const blocks: ChipBlock[] = texts.map((text) => {
    const lines = wrapChip(text, parts);
    return { text, lines, h: lines.length * CHIP_LINE_PX + CHIP_VPAD_PX };
  });
  const w = Math.max(...blocks.flatMap((b) => b.lines.map((l) => l.length))) * CHIP_CHAR_PX + CHIP_HPAD_PX;
  return { blocks, w, h: blocks.reduce((n, b) => n + b.h, 0) };
};

// Directions tried around the disc, best first: above, below, right, left, then the diagonals.
const ANGLES = [-90, 90, 0, 180, -45, -135, 45, 135, -67.5, -112.5, 67.5, 112.5, -22.5, -157.5, 22.5, 157.5];

/**
 * Picks, for each requested chip, a spot around its disc that overlaps no space disc (all spaces
 * of the frame, not just enclosures — a fighter token always sits on one), no other chip and
 * stays inside the frame. Tries the one-line chip first, then wraps it to 2 and 3 lines to fit
 * a gap; `null` = still crowded, draw the ring only. `spaces` x/y are fractions of the frame
 * width / height as the client renders them (`left: x%`, `top: y%`), `diam` a width fraction,
 * `framePx` the frame width in px and `aspect` its height / width.
 */
export const placeStakeChips = (
  requests: readonly ChipRequest[],
  spaces: readonly { id: SpaceId; x: number; y: number }[],
  diam: number,
  framePx: number,
  aspect: number
): Record<SpaceId, ChipPlacement | null> => {
  const rad = (diam * framePx) / 2;
  const discs = spaces.map((s) => ({ id: s.id, cx: s.x * framePx, cy: s.y * framePx * aspect }));
  const placed: Rect[] = [];
  const out: Record<SpaceId, ChipPlacement | null> = {};
  for (const req of requests) {
    out[req.id] = null;
    const me = discs.find((d) => d.id === req.id);
    if (!me || req.texts.length === 0) continue;
    search: for (let parts = 1; parts <= MAX_PARTS; parts++) {
      const { blocks, w, h } = layoutBlocks(req.texts, parts);
      for (const deg of ANGLES) {
        const ux = Math.cos((deg * Math.PI) / 180);
        const uy = Math.sin((deg * Math.PI) / 180);
        const dx = ux * (rad + CLEAR_PX) + (ux * w) / 2;
        const dy = uy * (rad + CLEAR_PX) + (uy * h) / 2;
        const rc: Rect = { l: me.cx + dx - w / 2, t: me.cy + dy - h / 2, r: me.cx + dx + w / 2, b: me.cy + dy + h / 2 };
        if (rc.l < 0 || rc.t < 0 || rc.r > framePx || rc.b > framePx * aspect) continue;
        if (discs.some((d) => rectHitsCircle(rc, d.cx, d.cy, rad + CLEAR_PX))) continue;
        if (placed.some((p) => rectsOverlap(p, rc))) continue;
        placed.push(rc);
        out[req.id] = { dx, dy, w, h, blocks };
        break search;
      }
    }
  }
  return out;
};
