import { LabsSetRow } from "./labs.type";

/**
 * Labs' finished card renders (#994). `rpc/set_by_slug` returns, next to the
 * set document, a `card_previews` map of key → finished card image: the card
 * exactly as Labs draws it, with the author's crop, zoom, hue shift, custom
 * symbols, split layouts and panels already baked in. Importing those as
 * full-art faces is what makes a Labs deck look right; the raw
 * `artwork.source` is the uncropped upload and is only a template fallback.
 *
 * Keys, as the real payload has them (see fixtures/):
 *   card:<card id>:front                 a card's face
 *   character-card:<character id>:front  the hero card
 *   deck-back:<character id>:front       the deck back
 *
 * Any of them can be missing (Oz Adventure has deck backs but no character
 * cards), so every lookup is optional.
 */
export type LabsPreviewKind = "card" | "character-card" | "deck-back";

export const labsPreviewUrl = (
  row: Pick<LabsSetRow, "card_previews">,
  kind: LabsPreviewKind,
  id: string,
): string | undefined => {
  const url = row.card_previews?.[`${kind}:${id}:front`];
  return typeof url === "string" && /^https:\/\//i.test(url) ? url : undefined;
};

/** Ids of the cards in `row` that have a finished face render. */
export const labsRenderedCardIds = (
  row: Pick<LabsSetRow, "card_previews">,
): Set<string> => {
  const ids = new Set<string>();
  for (const key of Object.keys(row.card_previews ?? {})) {
    const m = /^card:(.+):front$/.exec(key);
    if (m && labsPreviewUrl(row, "card", m[1])) ids.add(m[1]);
  }
  return ids;
};
