/**
 * The slice of table.place's tbpp pack format and tableplace-api's lobby
 * `placements` vocabulary this converter emits. Hand-written on purpose: the
 * converter has no dependency on table.place code, only on the documented
 * wire shapes (docs/packs.md, tableplace-api README).
 */
export type PackCard = {
  code: string;
  name: string;
  /** A face ref: plain https URL or `sheet:<json>`. */
  face: string;
};

export type PackDeck = {
  slot: string;
  name: string;
  back?: string;
  cards: PackCard[];
};

export type PieceState = { face: string; name?: string };

export type PackPiece = {
  kind: "token" | "counter";
  name: string;
  color?: string;
  imageUrl?: string;
  states?: PieceState[];
  maxValue?: number;
  position: [number, number];
};

export type PackOverlay = { imageUrl: string; ratio: number; scale: number };

export type TbppPack = {
  tbpp: 1;
  specVersion: "1.0.0";
  id: string;
  name: string;
  scope: "player" | "table";
  decks?: PackDeck[];
  pieces?: PackPiece[];
  overlays?: PackOverlay[];
};

export type DeckPlacement = {
  kind: "deck";
  pack: string;
  slot: string;
  seat: number;
  position: [number, number, number];
  rotation: number;
  faceUp: boolean;
};

export type PiecePlacement = {
  kind: "piece";
  pack: string;
  piece: number;
  seat: number;
  position: [number, number];
  rotation: number;
  value?: number;
};

export type CallerPlacement = DeckPlacement | PiecePlacement;

/** One card that could not be turned into a finished face. */
export type Skipped = string;
