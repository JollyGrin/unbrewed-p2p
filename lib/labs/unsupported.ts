import { LabsCard, LabsSet, LabsSetRow } from "./labs.type";
import { labsPreviewUrl } from "./previews";

/**
 * Labs card features our templated renderer can't draw. When any are present
 * the panel tells the player, before they save, to bring the deck in through
 * Labs' Tabletop Simulator export instead (full card art, same as the Club
 * path) — the deck is never misrendered silently.
 *
 * Only cards that fall back to the template can trip this: a card Labs
 * published a finished render for is imported as that image (#994), which
 * already shows every one of these features.
 *
 * The list is what the real payload carries (see fixtures/), not a guess.
 */
export type LabsUnsupportedFeatureId =
  | "custom-symbols"
  | "non-standard-symbol"
  | "split-card"
  | "other-template"
  | "bonus-attack"
  | "boost-effect"
  | "tuck-effect"
  | "ribbon-symbol"
  | "corner-badge"
  | "defense-ability"
  | "ability-icons"
  | "artwork-layers"
  | "unloadable-card-image"
  | "additional-character-cards";

export type LabsUnsupportedFeature = {
  id: LabsUnsupportedFeatureId;
  label: string;
  /**
   * titles of the affected cards (names of the extra character cards for
   * `additional-character-cards`; empty for the hero's own custom symbols)
   */
  cards: string[];
};

const LABELS: Record<LabsUnsupportedFeatureId, string> = {
  "custom-symbols": "Custom symbols",
  "non-standard-symbol": "Card types other than attack / defense / versatile / scheme",
  "split-card": "Split cards",
  "other-template": "Non-standard card templates",
  "bonus-attack": "Bonus-attack panels (shown as plain text)",
  "boost-effect": "Boost effects",
  "tuck-effect": "Tuck effects",
  "ribbon-symbol": "Ribbon symbols",
  "corner-badge": "Corner badges",
  "defense-ability": "Separate defense-side abilities",
  "ability-icons": "Icons on ability lines",
  "artwork-layers": "Layered card artwork",
  "unloadable-card-image": "Full-card images we can't load",
  "additional-character-cards": "Extra character cards",
};

const STANDARD_SYMBOLS = new Set(["attack", "defense", "defence", "versatile", "scheme"]);

const hasText = (s: string | null | undefined) => !!s && s.trim() !== "";

const anyAbilityText = (a: LabsCard["defenseAbility"]) =>
  !!a &&
  (hasText(a.plain) ||
    hasText(a.immediately) ||
    hasText(a.duringCombat) ||
    hasText(a.afterCombat) ||
    (a.bonusAbilities ?? []).some((b) => hasText(b.text)));

/** Per-card checks: each returns true when the card uses that feature. */
const CARD_CHECKS: [LabsUnsupportedFeatureId, (c: LabsCard) => boolean][] = [
  // Custom symbols can sit in any text field or icon slot; `{{custom:<id>}}`
  // is Labs' token for them, so look for it anywhere on the card.
  ["custom-symbols", (c) => /custom:/.test(JSON.stringify(c))],
  ["non-standard-symbol", (c) => c.type === "action" && !STANDARD_SYMBOLS.has(c.symbol ?? "")],
  ["other-template", (c) => c.type !== "action"],
  ["split-card", (c) => !!c.split],
  ["bonus-attack", (c) => !!c.showBonusAttack],
  ["boost-effect", (c) => !!c.showBoostEffect && hasText(c.boostEffect)],
  ["tuck-effect", (c) => !!c.showTuckEffect && hasText(c.tuckEffect)],
  ["ribbon-symbol", (c) => !!c.showRibbonSymbol],
  ["corner-badge", (c) => !!c.showCornerBadge],
  ["defense-ability", (c) => anyAbilityText(c.defenseAbility)],
  ["ability-icons", (c) => (c.ability?.bonusAbilities ?? []).some((b) => hasText(b.icon))],
  ["artwork-layers", (c) => (c.artworkLayers ?? []).length > 0],
  [
    "unloadable-card-image",
    (c) => !!c.useReplacement && !/^https:\/\//i.test(c.replacement?.source ?? ""),
  ],
];

/**
 * Everything in `characterId`'s action deck (plus the hero itself) that our
 * template can't express, in a stable order. Empty means it renders faithfully.
 * Pass the set's row to skip cards (and a hero card) that have a finished
 * render; without it every card is checked as if templated.
 */
export const detectLabsUnsupported = (
  set: LabsSet,
  characterId: string,
  row?: Pick<LabsSetRow, "card_previews">,
): LabsUnsupportedFeature[] => {
  const rendered = (kind: "card" | "character-card", id: string) =>
    !!row && !!labsPreviewUrl(row, kind, id);
  const deckIds = new Set(
    (set.decks ?? [])
      .filter((d) => d.kind === "action" && d.ownerId === characterId)
      .map((d) => d.id),
  );
  // Every card in the deck, whatever its template, so an odd one isn't skipped.
  const cards = (set.cards ?? []).filter(
    (c) => deckIds.has(c.deckId) && !rendered("card", c.id),
  );
  const hero = set.characters?.find((c) => c.id === characterId);

  const found = new Map<LabsUnsupportedFeatureId, string[]>();
  for (const card of cards) {
    for (const [id, check] of CARD_CHECKS) {
      if (!check(card)) continue;
      const titles = found.get(id) ?? [];
      const title = card.title?.trim() || card.heading?.trim() || card.name?.trim() || "Untitled";
      if (!titles.includes(title)) titles.push(title);
      found.set(id, titles);
    }
  }
  // A rendered hero card shows its own ability icons; the text version in our
  // hero panel reads them as "[name]", which is fine next to the real card.
  if (hero && !rendered("character-card", hero.id) && /custom:/.test(JSON.stringify(hero.abilities ?? [])) && !found.has("custom-symbols")) {
    found.set("custom-symbols", []);
  }
  // Extra character cards (Spy vs Spy's White Spy) come in as Labs' render,
  // like the hero card; only one without a render is lost, since the template
  // can't draw a character card at all.
  const missing = (hero?.additionalCards ?? [])
    .filter((extra) => !rendered("character-card", extra.id))
    .map((extra) => extra.name?.trim() || "Untitled");
  if (missing.length > 0) found.set("additional-character-cards", missing);

  return (Object.keys(LABELS) as LabsUnsupportedFeatureId[])
    .filter((id) => found.has(id))
    .map((id) => ({ id, label: LABELS[id], cards: found.get(id)! }));
};
