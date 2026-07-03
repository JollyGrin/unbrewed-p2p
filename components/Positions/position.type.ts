/**
 * Board token model.
 *
 * Each player owns one PositionBlob (keyed by player name on the relay) that
 * holds a flat list of tokens. Everyone renders everyone's tokens; only the
 * owning client edits its own blob — the relay is last-write-wins per player.
 */
export type BoardToken = {
  id: string;
  x: number;
  y: number;
  /** Rendered width in board px. Icons/discs are square. Default 72. */
  size?: number;
  /** Rendered height — only meaningful for image overlays (keeps aspect). */
  h?: number;
  /** Name of a bundled game-icon (react-icons/gi export, e.g. "GiFireShield"). */
  icon?: string;
  /** Icon tokens: render as a color disc with the icon cut out of it. */
  cutout?: boolean;
  /** Raster image (.png/.jpg/.webp) url. */
  imageUrl?: string;
  /** Overlay tokens (mini-maps etc.) render beneath all normal tokens. */
  overlay?: boolean;
  /** Locked overlays ignore all pointer events until the owner unlocks them. */
  locked?: boolean;
  /** Number badge pinned to the token's top-right corner. */
  counter?: TokenCounter;
};

export type TokenCounter = {
  /** Live-link to the owner's HUD health. Absent = detached manual counter. */
  link?: "hero" | "sidekick";
  /** The value of a detached counter (ignored while linked). */
  value?: number;
};

export type PositionBlob = {
  /** The player's color — every disc/icon token they own tints with it. */
  color?: string;
  tokens: BoardToken[];
};

/** A token annotated with its owner's name and color, counter resolved. */
export type OwnedToken = BoardToken & {
  owner: string;
  color?: string;
  /** Resolved badge number; null = linked but the owner has no pool yet. */
  counterDisplay?: number | null;
};

export const DEFAULT_PLAYER_COLOR = "#48284F";

/**
 * Pre-refactor wire shape: one hero object with nested sidekicks, ids by the
 * `${name}_${n}` convention. Kept only so migrateBlob can read old rooms.
 */
export type LegacyPositionType = {
  id: string;
  x: number;
  y: number;
  r?: number;
  color?: string;
  imageUrl?: string;
  sidekicks?: Omit<LegacyPositionType, "sidekicks">[];
};

export const DEFAULT_TOKEN_SIZE = 72;

/**
 * Normalize whatever shape is stored on the relay into a PositionBlob.
 * New blobs pass through; legacy hero+sidekick blobs get flattened, with the
 * hero's color becoming the player color.
 */
export function migrateBlob(raw: unknown): PositionBlob {
  if (!raw || typeof raw !== "object") return { tokens: [] };

  const blob = raw as Partial<PositionBlob>;
  if (Array.isArray(blob.tokens))
    return { color: blob.color, tokens: blob.tokens };

  const legacy = raw as Partial<LegacyPositionType>;
  if (typeof legacy.id !== "string") return { tokens: [] };

  const toToken = (p: Omit<LegacyPositionType, "sidekicks">): BoardToken => ({
    id: p.id,
    x: p.x ?? 0,
    y: p.y ?? 0,
    imageUrl: p.imageUrl,
    size: p.imageUrl ? DEFAULT_TOKEN_SIZE : p.r ?? DEFAULT_TOKEN_SIZE,
  });

  return {
    color: legacy.color,
    tokens: [
      toToken(legacy as LegacyPositionType),
      ...(legacy.sidekicks ?? []).map(toToken),
    ],
  };
}

let tokenCounter = 0;

/** Unique-enough id for a new token, namespaced by owner. */
export function newTokenId(owner: string): string {
  tokenCounter += 1;
  return `${owner}#${Date.now().toString(36)}${tokenCounter}`;
}
