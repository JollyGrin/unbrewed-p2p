/**
 * The slice of Unmatched Labs' public set payload that the importer reads.
 *
 * Shapes are taken from a real `rpc/set_by_slug` response (see
 * `fixtures/set-by-slug.dumbass-brigade.json`), not from any published schema:
 * Labs owns this format and bumps `schema_version` as it grows, so every field
 * here is optional-in-spirit and the mapper reads defensively.
 */

export type LabsAbility = {
  plain?: string;
  immediately?: string;
  duringCombat?: string;
  afterCombat?: string;
  bonusAbilities?: { text?: string; icon?: string }[];
};

export type LabsArtwork = { source?: string | null };

export type LabsCard = {
  id: string;
  deckId: string;
  /** "action" for deck cards, "rules" for rule cards; other templates exist */
  type: string;
  title?: string;
  name?: string;
  /** "hero" | "sidekick" | "any" */
  owner?: string;
  /** "attack" | "defense" | "versatile" | "scheme" — or a hybrid/custom one */
  symbol?: string | null;
  /** the printed value; `attack`/`defense` are builder defaults, not the value */
  symbolValue?: number | null;
  boost?: number | null;
  quantity?: number;
  ability?: LabsAbility;
  defenseAbility?: LabsAbility;
  artwork?: LabsArtwork;
  artworkLayers?: unknown[];
  useReplacement?: boolean;
  replacement?: LabsArtwork;
  split?: boolean;
  landscape?: boolean | null;
  showBonusAttack?: boolean;
  bonusAttackTitle?: string;
  bonusAttackValue?: number;
  bonusAttackAbility?: string;
  showBoostEffect?: boolean;
  boostEffect?: string;
  boostSymbol?: string;
  showTuckEffect?: boolean;
  tuckEffect?: string;
  showRibbonSymbol?: boolean;
  ribbonSymbol?: string;
  showCornerBadge?: boolean;
  cornerBadge?: string;
  /** rules cards */
  heading?: string;
  body?: string;
};

export type LabsDeck = {
  id: string;
  /** "action" | "rules" */
  kind: string;
  name?: string;
  /** character id, or null for a set-wide deck */
  ownerId: string | null;
};

export type LabsCharacter = {
  id: string;
  name: string;
  printedName?: string;
  /** "hero" | "minion" | … */
  role?: string;
  health?: number;
  move?: number;
  attackType?: string;
  quote?: { text?: string };
  abilities?: { kind?: string; name?: string; text?: string }[];
  artwork?: LabsArtwork;
  cardback?: { useReplacement?: boolean; replacement?: LabsArtwork };
  style?: { body?: { color?: string } };
  characterCard?: { border?: { color?: string } };
  sidekick?: {
    enabled?: boolean;
    name?: string;
    count?: number;
    health?: number;
    attackType?: string;
  };
  additionalCards?: LabsAdditionalCard[];
};

/**
 * An extra character card on a hero (Spy vs Spy's White Spy): a second
 * fighter with its own stats. Its id starts with `hchar_`, not `char_`, and
 * its finished render is keyed `character-card:<that id>:front`.
 */
export type LabsAdditionalCard = Pick<
  LabsCharacter,
  "name" | "health" | "move" | "attackType" | "quote" | "abilities" | "characterCard"
> & {
  id: string;
  subtitle?: string;
};

export type LabsCustomSymbol = { id: string; name?: string; source?: string | null };

export type LabsFigure = {
  id: string;
  /** "figure" | "dial" | "piece" | "token" */
  kind: string;
  name?: string;
  /** an uploaded 3D model file */
  model?: unknown;
  /** character id, or null for a set-wide component */
  characterId?: string | null;
  reference?: { source?: string | null };
  /** health dials: the numbers printed on the dial */
  dialRange?: { min?: number; max?: number } | null;
  /** the physical token: `shape` "circle" | "silhouette" | …; `twoSided` pieces carry a back face */
  token?: { shape?: string; twoSided?: boolean } | null;
};

export type LabsMap = { spaces?: unknown[] };

export type LabsSet = {
  id: string;
  name: string;
  characters: LabsCharacter[];
  decks: LabsDeck[];
  cards: LabsCard[];
  customSymbols?: LabsCustomSymbol[];
  figures?: LabsFigure[];
  /** older sets carry one map here, newer ones use `maps` */
  map?: LabsMap | null;
  maps?: LabsMap[] | null;
  /** Adventures sets */
  threat?: { enabled?: boolean } | null;
};

/** One row of `rpc/set_by_slug`. */
export type LabsSetRow = {
  id: string;
  owner_id: string;
  slug: string;
  name: string;
  revision?: number;
  schema_version?: number;
  scope?: string;
  created_at?: string;
  updated_at?: string;
  document: { set: LabsSet };
  /**
   * Finished card images Labs renders on publish, keyed
   * `card:<id>:front` / `character-card:<id>:front` / `deck-back:<id>:front`.
   * See `previews.ts`.
   */
  card_previews?: Record<string, string> | null;
  /** bumped when Labs changes its renderer */
  card_preview_version?: number | null;
  /** per-key content fingerprint Labs uses to decide what to re-render */
  card_preview_fingerprints?: Record<string, string> | null;
};

/** A fetched set, plus what the pasted link said about it. */
export type LabsLoadedSet = {
  row: LabsSetRow;
  /** the set owner's Labs display name, when it could be read */
  author?: string;
  /** the character the pasted link pointed at, if it named one */
  characterId?: string;
  /**
   * The component objects of the set's hosted Tabletop Simulator save (#1001),
   * in save order. Absent when the set has no components or the save could
   * not be read — the deck then imports without component tokens.
   */
  ttsModels?: LabsTtsModel[];
};

/** One `Custom_Model` object of a hosted Tabletop Simulator save. */
export type LabsTtsModel = {
  nickname: string;
  /** the finished face image (`CustomMesh.DiffuseURL`) */
  imageUrl?: string;
  /** Labs' shared health-dial mesh (and its Lua script) */
  isDial: boolean;
};
