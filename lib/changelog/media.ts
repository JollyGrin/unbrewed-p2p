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

export const posterUrl = (slug: string): string | null =>
  slug ? `${base}/changelog/${slug}-poster.webp` : null;
