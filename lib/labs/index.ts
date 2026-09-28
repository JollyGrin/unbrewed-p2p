/**
 * Unmatched Labs import (#978): parse a pasted link, fetch the public set,
 * map one hero into a bag deck. Plain functions, no React — the Bag panel and
 * the `?deckId=` deep links (#979) both call these directly.
 */
export * from "./parse";
export * from "./errors";
export * from "./fetch";
export * from "./map";
export * from "./unsupported";
export * from "./previews";
export type {
  LabsAdditionalCard,
  LabsCard,
  LabsCharacter,
  LabsDeck,
  LabsLoadedSet,
  LabsSet,
  LabsSetRow,
} from "./labs.type";
