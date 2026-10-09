/**
 * Adventure card faces on the CDN (#1104). ONE map: engine card id -> CDN slug. An id with no
 * uploaded face returns null so callers keep their placeholder (never a broken image).
 *
 * Faces are ~0.696 w:h (initiative cards ~0.62), NOT 63:88 — render with `object-fit: contain`.
 * Ids come from the engine's `data/enemies/*.rules.ts`; scenario decks (support / terrain /
 * genetic-enhancements / observation-tower / mosasaurus) have faces uploaded but no engine ids
 * yet — add them here when the engine encodes them.
 */
export const ADVENTURE_CARD_CDN_BASE =
  "https://cdn.unbrewed.xyz/p2p/adventures/jurassic-park/cards";

/** engine card id -> `<deck>/<slug>` under the CDN base */
export const ADVENTURE_CARD_SLUGS: Record<string, string> = {
  // Indominus Rex villain deck (initiative card id = the enemy id)
  "indominus-rex": "irex/irex-initiative",
  "indominus-rex/exaggerated-predator-traits": "irex/irex-alt-exaggerated-predator-traits",
  "indominus-rex/genetic-abomination": "irex/irex-alt-genetic-abomination",
  "indominus-rex/killing-for-sport": "irex/irex-alt-killing-for-sport",
  "indominus-rex/bigger-louder-more-teeth": "irex/irex-bigger",
  "indominus-rex/learning-her-place-in-the-food-chain": "irex/irex-learning",
  "indominus-rex/deception": "irex/irex-deception",
};

/** CDN URL of a card face, or null when none is uploaded. Strips a `#n` instance / `@fighter` suffix. */
export const adventureCardArt = (cardId: string | null | undefined): string | null => {
  if (!cardId) return null;
  const slug = ADVENTURE_CARD_SLUGS[cardId.replace(/[#@].*$/, "")];
  return slug ? `${ADVENTURE_CARD_CDN_BASE}/${slug}.webp` : null;
};

/**
 * Seam for the villain / minion tokens (not uploaded yet): `enemyId -> token URL`. Always null
 * today, so every caller keeps its letter-avatar fallback.
 */
export const adventureEnemyTokenArt = (_enemyId: string | null | undefined): string | null => null;
