import type { DeckImportCardType } from "../DeckPool/deck-import.type";

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
  /**
   * Crop for an `imageUrl` that points at a sprite sheet rather than a single
   * image (Tabletop Simulator / the-unmatched.club exports pack ~70 faces into
   * one file). Absent = the url is a whole image, rendered as before.
   *
   * This is what lets a hero/rule card ride onto the board as a plain image
   * token instead of a card token: the art is croppable without coupling the
   * token to a pool card (see heroCardToken).
   */
  sheet?: SheetCrop;
  /** Overlay tokens (mini-maps etc.) render beneath all normal tokens. */
  overlay?: boolean;
  /** Locked overlays ignore all pointer events until the owner unlocks them. */
  locked?: boolean;
  /** Number badge pinned to the token's top-right corner. */
  counter?: TokenCounter;
  /**
   * A card played from the owner's hand onto the table. The whole card rides
   * in the token (URLs only, never base64) so it can return to hand/deck/
   * discard intact — a card token is the card while it sits on the board.
   */
  card?: DeckImportCardType;
  /** Card tokens: render the back instead of the face (everyone sees the back). */
  faceDown?: boolean;
  /**
   * Card tokens spawned by "Reveal hand" (issue #426, item 3). Tagged so
   * "Return all to hand" can find and reclaim exactly that batch, leaving any
   * manually-played or boost tokens on the table.
   */
  fromReveal?: boolean;
};

/**
 * A token loadout entry saved on a deck (see DeckImportType.savedTokens).
 *
 * Position and identity are per-game, so they are stripped; card tokens are
 * excluded too — a saved card would detach from the pool it belongs to and
 * duplicate itself into every game the deck is used in.
 */
export type SavedToken = Omit<
  BoardToken,
  "id" | "x" | "y" | "card" | "faceDown" | "fromReveal"
>;

/** Drop the per-game fields so a board token can be stored on a deck. */
export function toSavedToken(token: Partial<BoardToken>): SavedToken {
  const { id, x, y, card, faceDown, fromReveal, ...saved } = token;
  return saved;
}

/**
 * Which cell of a sprite sheet an image token shows. Mirrors the geometry
 * fields of CardImageRef (minus the url, which lives on the token) so the
 * same ImageFace renderer can draw both.
 */
export type SheetCrop = {
  cols: number;
  rows: number;
  /** 0-based cell index, counted left-to-right then top-to-bottom. */
  index: number;
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
  /** Card tokens: name of the player who has asked to pick this card up. */
  claimedBy?: string;
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

/** Card tokens keep the 63x88 card aspect; size = width in board px.
 * Cards land at full size (the resize slider's max) — readable first,
 * shrink later if the table gets crowded. */
export const DEFAULT_CARD_TOKEN_WIDTH = 260;

export const cardTokenHeight = (width: number) =>
  Math.round((width * 88) / 63);

/**
 * Bridge from the hand (playerstate channel) to the board (playerposition
 * channel): the hand splices the card out of the pool, then hands it here to
 * be spawned as a card token — at screenPos (drag-drop) or viewport center.
 */
export type PlayCardToTable = (
  card: DeckImportCardType,
  opts?: {
    faceDown?: boolean;
    screenPos?: { x: number; y: number };
    /** Rendered width in board px; defaults to DEFAULT_CARD_TOKEN_WIDTH. */
    size?: number;
  },
) => void;

/**
 * Board-owned macros bridged up to the hand controls (issue #426, items 2–3):
 * these mutate both the pool (playerstate) and the board tokens
 * (playerposition), which only the board container can do together, so it
 * publishes them through a ref for the hand's buttons to call.
 */
export type BoardActions = {
  /** Lay every hand card face-up on the table in a row. */
  revealHand: () => void;
  /** Reclaim exactly the cards laid out by revealHand back into the hand. */
  returnRevealedHand: () => void;
};

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

/**
 * Where a fresh player's tokens land: the top-left of the 1200x1000 map, the
 * same corner the lone starter disc has always used.
 */
export const SPAWN_ORIGIN = { x: 150, y: 100 };
const SPAWN_GAP = 24;
const SPAWN_ROW_MAX_X = 1050;

/**
 * Lay a deck's saved loadout out near the player's edge of the board: a row
 * running right from SPAWN_ORIGIN, wrapping onto a new row before it would
 * run off the map. Overlays (mini-maps, zones) are wide and get their own row.
 */
export function spawnSavedTokens(
  saved: SavedToken[],
  owner: string,
): BoardToken[] {
  let x = SPAWN_ORIGIN.x;
  let y = SPAWN_ORIGIN.y;
  let rowHeight = 0;

  return saved.map((token) => {
    const w = token.size ?? DEFAULT_TOKEN_SIZE;
    const h = token.h ?? w;
    if (x > SPAWN_ORIGIN.x && x + w > SPAWN_ROW_MAX_X) {
      x = SPAWN_ORIGIN.x;
      y += rowHeight + SPAWN_GAP;
      rowHeight = 0;
    }
    const placed: BoardToken = { ...token, id: newTokenId(owner), x, y };
    x += w + SPAWN_GAP;
    rowHeight = Math.max(rowHeight, h);
    return placed;
  });
}

let tokenCounter = 0;

/** Unique-enough id for a new token, namespaced by owner. */
export function newTokenId(owner: string): string {
  tokenCounter += 1;
  return `${owner}#${Date.now().toString(36)}${tokenCounter}`;
}
