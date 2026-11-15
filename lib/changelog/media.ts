/**
 * Changelog media URLs. Media lives on the public CDN
 * (https://cdn.unbrewed.xyz), which is the default base. Set
 * `NEXT_PUBLIC_CHANGELOG_MEDIA_URL` only to override it; unset or empty falls
 * back to the default. Both helpers return `null` only for an empty slug, and
 * consuming UI renders such an entry as text only.
 */
const DEFAULT_MEDIA_BASE = "https://cdn.unbrewed.xyz";

const rawBase = process.env.NEXT_PUBLIC_CHANGELOG_MEDIA_URL?.replace(/\/+$/, "");
const base = rawBase || DEFAULT_MEDIA_BASE;

export const videoUrl = (slug: string): string | null =>
  slug ? `${base}/changelog/${slug}.mp4` : null;

/**
 * Posters are served with a one-year immutable cache, so a regenerated poster
 * under the same key never reaches browsers or the Cloudflare edge. Bump this
 * whenever posters are re-uploaded with --force.
 *   v2: frame moved from 1s (mid card flip) to 3s.
 */
const POSTER_VERSION = 2;

export const posterUrl = (slug: string): string | null =>
  slug ? `${base}/changelog/${slug}-poster.webp?v=${POSTER_VERSION}` : null;
