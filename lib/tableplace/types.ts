import type { DeckImportCardType } from "@/components/DeckPool/deck-import.type";

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
  /** Footprint radius in world units; table.place defaults a token to 0.75. */
  radius?: number;
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
  /** `[x, z]`: the height is table.place's. `[x, 0, z]` sinks into the felt. */
  position: [number, number];
  /** Yaw in DEGREES, absolute: 0 faces like seat 0, 180 like seat 1. */
  rotation: number;
  faceUp?: boolean;
  /**
   * Deal the pile in a random order at load — a facedown draw pile — instead
   * of table.place's default of restoring the pack's authored order. The
   * shuffle happens once, at lobby creation, so every joiner sees the same
   * pile. Exclusive with `order`, which we never send.
   */
  shuffle?: boolean;
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

/** api.table.place §4.6: a spot a dropped card or piece finishes on. */
export type SnapPoint = {
  position: [number, number];
  rotation?: number;
  radius?: number;
};

/** The whole `POST /v1/lobbies` body. */
export type LobbyRequest = {
  version: 1;
  layout: "duel-2p";
  packs: TbppPack[];
  placements: CallerPlacement[];
  snapPoints: SnapPoint[];
  ttlSeconds: number;
};

/** One card that could not be turned into a finished face. */
export type Skipped = string;

/**
 * Resolves a finished card face. Called with a card it answers that card's
 * face; the optional members answer the face-up singles (hero, sidekick, rule
 * cards, extra characters), which have no card object of their own. `rule`
 * takes the ORIGINAL index into `deck_data.ruleCards`. A plain function still
 * works: the converter falls back to it for those singles.
 */
type FaceMembers = {
  hero: () => string | null;
  sidekick: () => string | null;
  rule: (index: number) => string | null;
  extraCharacter: (index: number, part: "hero" | "sidekick") => string | null;
};

export type FaceResolver = ((card: DeckImportCardType) => string | null) &
  Partial<FaceMembers>;

/** A resolver that answers every face-up single, e.g. a runtime face renderer. */
export type FullFaceResolver = ((card: DeckImportCardType) => string | null) &
  FaceMembers;
