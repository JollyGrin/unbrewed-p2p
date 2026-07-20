import { DateString, HexColorString, ValidUrlString } from "@/lib/generic.type";
// type-only: position.type imports DeckImportCardType back from here, and
// erasing both sides keeps that cycle out of the emitted module graph.
import type { SavedToken } from "@/components/Positions/position.type";

export type DeckImportType = {
  bgg_link: string | null;
  created_on: DateString;
  deck_first_published_on: DateString;
  deck_data: DeckImportDataType;
  deck_published: boolean;
  family_id: string;
  id: string;
  liked: boolean;
  likes: Number;
  name: string;
  note: string;
  published: boolean;
  published_on: DateString;
  /**
   * External attribution page for this deck when it lives somewhere other than
   * unmatched.cards (e.g. the-unmatched.club). Optional and additive: mirrors the
   * `sourceUrl` on PopularDeckMeta so the committed snapshot is self-describing.
   */
  sourceUrl?: string;
  /**
   * Token loadout for this deck: starring it and joining a game spawns these
   * on the board automatically (GameShell), so a sandbox player stops
   * rebuilding the same markers every session. Edited in /bag.
   *
   * Optional and additive — decks without it behave exactly as before, and
   * because decks serialize whole these ride through export/import untouched.
   * Image tokens are URLs only, never base64: DECKS is capped at ~5MB and the
   * position blob is rebroadcast over the websocket on every action.
   */
  savedTokens?: SavedToken[];
  /**
   * Preferred player color for this deck; tints the spawned tokens. Typed as
   * a plain string (not HexColorString) because it is copied straight into
   * PositionBlob.color, which the relay carries untyped.
   */
  savedTokenColor?: string;
  tags: string[];
  updated_on: DateString;
  user: string;
  version_id: string;
  version_name: string;
  versions: DeckImportVersionType[];
};

export type DeckImportDataType = {
  appearance: DeckImportAppearanceType;
  cards: DeckImportCardType[];
  hero: DeckImportHeroType;
  sidekick: DeckImportSidekickType;
  name: string;
  ruleCards?: DeckImportRuleCardType[];
  extraCharacters?: any[];
};

export type DeckImportAppearanceType = {
  borderColour: HexColorString;
  cardbackUrl: string;
  highlightColour: HexColorString;
  isPNP: boolean;
  patternName: string;
};

export type UnmatchedCardType = "scheme" | "defence" | "versatile" | "attack";

/**
 * Whole-card image reference. When present on a card, the face IS this
 * image (rendered by Card instead of the generated SVG template).
 * URLs only — never base64: the whole pool is rebroadcast over the
 * websocket on every action, and localStorage is capped at ~5MB.
 */
export type CardImageRef = {
  url: string;
  /** sprite-sheet support (Tabletop Simulator exports): omit for single-card images */
  cols?: number;
  rows?: number;
  /** 0-based cell index within the sheet */
  index?: number;
};

export type DeckImportCardType = {
  afterText: string;
  basicText: string;
  boost: number;
  characterName: string;
  duringText: string;
  imageUrl: ValidUrlString;
  immediateText: string;
  quantity: number;
  title: string;
  type: UnmatchedCardType;
  value: number | null;
  cardImage?: CardImageRef;
  /**
   * Face-down art for this card. Card-level (not deck-level) because
   * pooled cards detach from deck_data and sync whole over the websocket.
   */
  cardBackUrl?: string;
  /**
   * Hero/rule cards ride along in TTS imports but must not be shuffled
   * into the draw deck. makeDeck skips cards with this flag.
   */
  isCharacterCard?: boolean;
};

export type PoolCardType = Omit<DeckImportCardType, "quantity">;

export type DeckImportHeroType = {
  hp: number;
  isRanged: boolean;
  move: number;
  name: string;
  specialAbility: string;
  quote?: string;
  /**
   * Portrait art for this fighter's board token, clipped into the circle on the
   * Pro board (see ProBoard.fighterToken + lib/pro/useProCardArt). Optional and
   * additive: only the evergreen decks with painted token art set it; converted
   * decks omit it and render initials-only exactly as before.
   */
  tokenImageUrl?: string;
};

export type DeckImportSidekickType = Omit<
  DeckImportHeroType,
  "hp" | "specialAbility" | "move"
> & {
  hp: number | null;
  quantity: number | null;
  quote: string;
};

export type DeckImportRuleCardType = {
  content: string;
  title: string;
};

export type DeckImportVersionType = {
  created_on: DateString;
  id: string;
  name: string;
  published: boolean;
  updated_on: DateString;
  version_name: string;
};
