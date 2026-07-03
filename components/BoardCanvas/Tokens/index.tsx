/**
 * SVG string builders for board tokens. These get injected into the d3 canvas
 * via selection.html(), so every value interpolated into markup is escaped.
 */
export const escapeAttr = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const circle = ({ color, size }: { color?: string; size: number }) =>
  `<svg fill="${escapeAttr(color ?? "#2C1831")}" viewBox="0 0 100 100" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="48" />
</svg>`;

const image = ({ url, w, h }: { url: string; w: number; h: number }) =>
  `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
  <image href="${escapeAttr(url)}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet" />
</svg>`;

/** Dashed halo drawn around the currently selected token. */
const selectionRing = ({ w, h }: { w: number; h: number }) =>
  `<rect x="-4" y="-4" width="${w + 8}" height="${h + 8}" rx="8" fill="none" stroke="#E7CC98" stroke-width="2" stroke-dasharray="7 5" pointer-events="none" />`;

/**
 * Number badge pinned to the token's top-right corner. Lives inside the token
 * group so it follows every drag. `title` becomes the hover tooltip.
 */
const counterBadge = ({
  w,
  text,
  title,
}: {
  w: number;
  text: string;
  title: string;
}) =>
  `<g class="counter" transform="translate(${w - 5}, 5)" cursor="pointer">
  <title>${escapeAttr(title)}</title>
  <circle r="12" fill="#F7ECD7" stroke="#48284F" stroke-width="1.5" />
  <text text-anchor="middle" dominant-baseline="central" font-family="Verdana, sans-serif" font-size="10.5" font-weight="700" fill="#2C1831">${escapeAttr(text)}</text>
</g>`;

export const TokenMarkup = {
  circle,
  image,
  selectionRing,
  counterBadge,
};
