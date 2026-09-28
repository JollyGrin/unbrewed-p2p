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

/** `fit: "slice"` fills the box (a round clip then shows no letterbox). */
const image = ({
  url,
  w,
  h,
  fit = "meet",
}: {
  url: string;
  w: number;
  h: number;
  fit?: "meet" | "slice";
}) =>
  `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
  <image href="${escapeAttr(url)}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid ${fit}" />
</svg>`;

/**
 * One cell of a sprite sheet stretched to fill the token's own w×h box —
 * for pieces whose cells are not card-shaped (square discs, dials). Card-
 * aspect sheet tokens keep the ImageFace path (sheetImageMarkup).
 */
const sheetCell = ({
  url,
  w,
  h,
  cols,
  rows,
  index,
}: {
  url: string;
  w: number;
  h: number;
  cols: number;
  rows: number;
  index: number;
}) =>
  `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
  <image href="${escapeAttr(url)}" x="${-(index % cols) * w}" y="${
    -Math.floor(index / cols) * h
  }" width="${w * cols}" height="${h * rows}" preserveAspectRatio="none" />
</svg>`;

/**
 * Clip a face (any of the svg strings above, or a sheet cell) to the largest
 * circle centred in its box. `id` must be unique in the document — clip ids
 * are global, like the cutout masks.
 */
const circleClip = ({
  id,
  w,
  h,
  inner,
}: {
  id: string;
  w: number;
  h: number;
  inner: string;
}) =>
  `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
  <defs><clipPath id="${escapeAttr(id)}"><circle cx="${w / 2}" cy="${h / 2}" r="${
    Math.min(w, h) / 2
  }" /></clipPath></defs>
  <g clip-path="url(#${escapeAttr(id)})">${inner}</g>
</svg>`;

/**
 * Stand-in for an image face whose image failed to load — an expired Labs
 * hosted-save image (#1029), a dead pasted link. Keeps the token's box (round
 * when the face was) so it stays visible and grabbable, and says why on hover.
 */
const missingImage = ({
  w,
  h,
  round = false,
}: {
  w: number;
  h: number;
  round?: boolean;
}) => {
  const shape = round
    ? `<circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 2 - 1}"`
    : `<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="8"`;
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
  <title>Image unavailable — refresh the deck, or re-import it, to get a new one</title>
  ${shape} fill="#2C1831" fill-opacity="0.55" stroke="#E7CC98" stroke-width="2" stroke-dasharray="6 4" />
  <text x="${w / 2}" y="${h / 2}" text-anchor="middle" dominant-baseline="central" font-family="Verdana, sans-serif" font-size="${Math.round(
    Math.min(w, h) * 0.4,
  )}" font-weight="700" fill="#E7CC98">?</text>
</svg>`;
};

/** Dashed halo drawn around the currently selected token. */
const selectionRing = ({
  w,
  h,
  round = false,
}: {
  w: number;
  h: number;
  round?: boolean;
}) =>
  round
    ? `<circle cx="${w / 2}" cy="${h / 2}" r="${
        Math.min(w, h) / 2 + 4
      }" fill="none" stroke="#E7CC98" stroke-width="2" stroke-dasharray="7 5" pointer-events="none" />`
    : `<rect x="-4" y="-4" width="${w + 8}" height="${h + 8}" rx="8" fill="none" stroke="#E7CC98" stroke-width="2" stroke-dasharray="7 5" pointer-events="none" />`;

/**
 * Name pill hung under the token, centred. Token-pixel coords like the
 * counter badge, so it follows every drag; inert so it never eats a grab.
 */
const labelPlate = ({ w, h, text }: { w: number; h: number; text: string }) => {
  const lw = text.length * 6.2 + 14;
  return `<g class="label" transform="translate(${w / 2}, ${h + 12})" pointer-events="none">
  <rect x="${-lw / 2}" y="-9" width="${lw}" height="18" rx="9" fill="#2C1831" stroke="#E7CC98" stroke-width="1" opacity="0.9" />
  <text text-anchor="middle" dominant-baseline="central" font-family="Verdana, sans-serif" font-size="10" font-weight="700" fill="#F7ECD7">${escapeAttr(
    text,
  )}</text>
</g>`;
};

/** Pulsing halo on a card token another player has asked to pick up.
 * Visible to everyone so the owner sees the request too. */
const claimRing = ({ w, h }: { w: number; h: number }) =>
  `<rect x="-5" y="-5" width="${w + 10}" height="${h + 10}" rx="9" fill="none" stroke="#E7CC98" stroke-width="3" pointer-events="none">
  <animate attributeName="opacity" values="1;0.25;1" dur="1.1s" repeatCount="indefinite" />
</rect>`;

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
  sheetCell,
  circleClip,
  missingImage,
  selectionRing,
  labelPlate,
  claimRing,
  counterBadge,
};
