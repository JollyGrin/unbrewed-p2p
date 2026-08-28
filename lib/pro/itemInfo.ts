import { ProMapItem } from "./protocol";

// ---------------------------------------------------------------------------
// Item open information (p2p #731). Unmatched's convention is that everything
// on the board is open information — hands and facedown combat cards are the
// only hidden things — so every surface that names a battlefield item (board
// badge popover, action dock, map preview) derives its effect text HERE, from
// the same pure functions, and the three can never drift apart.
//
// Combat items describe themselves from `value`. Scheme items can't — their
// `ops` is server-side DSL the client never interprets — so p2p #693 added the
// optional authored `text`. Maps written before that (and any item whose author
// left it blank) simply have no effect line, and callers fall back to the label.
// ---------------------------------------------------------------------------

/**
 * The one-line effect text of a battlefield item, or undefined when the map
 * doesn't say (a scheme item authored before `text` existed, or left blank).
 * Combat items always describe themselves, from their printed value.
 */
export const itemEffectText = (item: ProMapItem): string | undefined => {
  if (item.kind === "combat")
    return `+${item.value ?? 0} to a combat card played from this space`;
  return item.text?.trim() || undefined;
};

/**
 * "<label> — <effect>" one-liner for the contexts that print an item as a
 * single string (the badge's native `title`, the map preview's item list).
 * A scheme item with no authored effect keeps today's bare label — printing
 * "Bomb — Bomb" (label as its own effect) would be noise, not information.
 */
export const itemBadgeTitle = (item: ProMapItem): string => {
  const effect = itemEffectText(item);
  return effect ? `${item.label} — ${effect}` : item.label;
};

/** Plain-English kind of a battlefield item, for the inspect popover. */
export const itemKindLabel = (kind: ProMapItem["kind"]): string =>
  kind === "combat" ? "Combat item" : "Scheme item";
