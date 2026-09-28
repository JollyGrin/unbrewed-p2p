/**
 * Changelog media URLs. The CDN doesn't exist yet — with
 * `NEXT_PUBLIC_CHANGELOG_MEDIA_URL` unset both helpers return `null` and
 * consuming UI renders the entry as text only. Never invent a default URL.
 */
const rawBase = process.env.NEXT_PUBLIC_CHANGELOG_MEDIA_URL;
const base = rawBase ? rawBase.replace(/\/+$/, "") : null;

export const videoUrl = (slug: string): string | null =>
  base ? `${base}/changelog/${slug}.mp4` : null;

export const posterUrl = (slug: string): string | null =>
  base ? `${base}/changelog/${slug}-poster.webp` : null;
