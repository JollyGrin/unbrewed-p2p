/**
 * Shared core for the evergreen deck rules-lock: projects a deck-JSON snapshot
 * down to the fields the Pro rules engine actually cares about, then hashes
 * that projection. Presentation fields (art, appearance, notes, likes,
 * upstream version history) are excluded on purpose — editing them must never
 * trip the lock. CommonJS so it loads unchanged from both the plain-Node
 * maintenance script (scripts/deck-manifest.mjs) and the Jest test
 * (lib/pro/evergreenManifest.test.ts).
 */
const { createHash } = require("node:crypto");

// JSON "defence" (community-deck spelling) <-> rules.ts "defense" — same type,
// different spelling convention. Normalize before hashing so a hero whose
// deck copy already says "defense" doesn't get treated as a different card.
const normalizeType = (type) => (type === "defence" ? "defense" : type);

/**
 * Rules-relevant projection of a deck snapshot: card titles/types/values/
 * boosts/quantities, hero hp/move/reach, sidekick. Everything else
 * (imageUrl, appearance, note, likes, versions, text blocks) is presentation
 * and is dropped here so it can never affect the digest.
 *
 * A deck whose sidekick is CHOSEN at setup (Harry Dresden, protocol v42) also
 * locks its `sidekickOptions` and each card's `sidekickOption` tag: which cards
 * a pick puts in the deck is rules. Both keys are added only when present, so
 * every other deck's projection, and its committed digest, is unchanged.
 */
function projectRules(deckJson) {
  const d = deckJson.deck_data;
  const sidekickOf = (s) => ({
    hp: s.hp,
    quantity: s.quantity,
    isRanged: s.isRanged,
  });
  return {
    hero: {
      hp: d.hero.hp,
      move: d.hero.move,
      isRanged: d.hero.isRanged,
    },
    sidekick: d.sidekick ? sidekickOf(d.sidekick) : null,
    ...(d.sidekickOptions
      ? {
          sidekickOptions: d.sidekickOptions.map((s) => ({
            name: s.name,
            ...sidekickOf(s),
          })),
        }
      : {}),
    cards: d.cards.map((c) => ({
      title: c.title,
      type: normalizeType(c.type),
      value: c.value,
      boost: c.boost,
      quantity: c.quantity,
      ...(c.sidekickOption ? { sidekickOption: c.sidekickOption } : {}),
    })),
  };
}

function computeDigest(deckJson) {
  const projection = projectRules(deckJson);
  const hash = createHash("sha256").update(JSON.stringify(projection)).digest("hex");
  return `sha256:${hash}`;
}

module.exports = { projectRules, computeDigest, normalizeType };
