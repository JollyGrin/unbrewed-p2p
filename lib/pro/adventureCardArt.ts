/**
 * Adventure card faces on the CDN (#1104, #1330). The URL is DERIVED from the engine card id by
 * convention — there is no per-card id -> slug map:
 *
 *   `<scenario base>/<enemy dir>/<enemy prefix>-<card slug>.webp`
 *
 * - `<card slug>` is the engine id after the `/` (`indominus-rex/deception` -> `deception`); the
 *   initiative card's id is the bare enemy id -> `initiative`.
 * - Scenario base: `https://cdn.unbrewed.xyz/p2p/adventures/<scenario>/cards`.
 * - Enemy dir / prefix: the CDN names the Indominus folder `irex`, not `indominus-rex`, so an enemy
 *   whose files differ from its engine id has ONE per-ENEMY entry in `ENEMY_ART` (not per card).
 *
 * `ENEMY_ART` also lists the file stems actually uploaded for that enemy. Nothing is ever
 * uploaded/renamed from here; a stem that is not listed resolves to null, so callers keep their
 * text face (never a broken image). Each id is tried as `<prefix>-<slug>`, `<prefix>-alt-<slug>`
 * (the alternate faces) and `<prefix>-<first word of slug>` (the CDN's short names, e.g.
 * `irex-bigger` for `bigger-louder-more-teeth`), first listed stem wins.
 *
 * Faces are ~0.696 w:h (initiative cards ~0.62), NOT 63:88 — render with `object-fit: contain`.
 * Scenario decks (support / terrain / genetic-enhancements / observation-tower / mosasaurus) have
 * faces uploaded but no engine ids yet. Enemies with no entry (every Clockwork Heist enemy) are null.
 */
/*
 * FUTURE UPLOADS: `<base>/<enemy-dir>/<card-slug>.<ext>` with the engine card slug (`conventionArtUrl`
 * below), e.g. `.../jurassic-park/cards/<enemy>/<slug>.webp`. The Indominus `ENEMY_ART` stem list is
 * LEGACY uploads (irex- prefix, short names) that predate the convention and cannot be renamed.
 * `adventureCardArt` only returns a URL for an enemy with an `ENEMY_ART` entry, because the shared
 * card renderers have no image-error fallback: an unlisted enemy's URL would render a broken image.
 */
const CDN_ROOT = "https://cdn.unbrewed.xyz/p2p/adventures";
const cardBase = (scenario: string) => `${CDN_ROOT}/${scenario}/cards`;

/** The Jurassic Park scenario's card base (the only scenario with uploaded faces). */
export const ADVENTURE_CARD_CDN_BASE = cardBase("jurassic-park");

export interface EnemyArt {
  /** CDN scenario folder under `/p2p/adventures/`. */
  scenario: string;
  /** Folder under `<base>/` holding this enemy's faces. */
  dir: string;
  /** File-name prefix: `<prefix>-<slug>.webp`. */
  prefix: string;
  /** Uploaded stems, without the `<prefix>-` and `.webp`. Verified by HEAD, 2026-10-10. */
  stems: readonly string[];
}

/** engine enemy id -> its art layout. Only enemies with uploaded faces appear. */
export const ENEMY_ART: Record<string, EnemyArt> = {
  "indominus-rex": {
    scenario: "jurassic-park",
    dir: "irex",
    prefix: "irex",
    stems: [
      "initiative",
      "alt-exaggerated-predator-traits",
      "alt-genetic-abomination",
      "alt-killing-for-sport",
      "bigger",
      "learning",
      "deception",
    ],
  },
};

/** The pure convention: `<scenario base>/<enemy dir>/<card slug>.webp` (no prefix, no inventory). */
export const conventionArtUrl = (scenario: string, enemyDir: string, slug: string): string =>
  `${cardBase(scenario)}/${enemyDir}/${slug}.webp`;

/** CDN URL of a card face, or null when none is uploaded. Strips a `#n` instance / `@fighter` suffix. */
export const adventureCardArt = (cardId: string | null | undefined): string | null => {
  if (!cardId) return null;
  const id = cardId.replace(/[#@].*$/, "");
  const slash = id.indexOf("/");
  const art = ENEMY_ART[slash < 0 ? id : id.slice(0, slash)];
  if (!art) return null;
  const slug = slash < 0 ? "initiative" : id.slice(slash + 1);
  const stem = [slug, `alt-${slug}`, slug.split("-")[0]].find((s) => art.stems.includes(s));
  return stem ? `${cardBase(art.scenario)}/${art.dir}/${art.prefix}-${stem}.webp` : null;
};

/**
 * Seam for the villain / minion tokens (not uploaded yet): `enemyId -> token URL`. Always null
 * today, so every caller keeps its letter-avatar fallback.
 */
export const adventureEnemyTokenArt = (_enemyId: string | null | undefined): string | null => null;
