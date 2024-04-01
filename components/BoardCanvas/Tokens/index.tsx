const Image = ({ imageUrl }: { imageUrl: string }) =>
  `<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 24 24">
<image href="${imageUrl}" height='100%' >
</svg>`;

const Circle = ({
  color,
  size,
}: {
  color?: string;
  size?: number;
}) => `<svg fill="${color ?? "black"}" stroke="2" viewBox="0 0 100 100" width="${size ?? 72}" height="${size ?? 72}" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="50" />
</svg>`;

export const TokenIcon = {
  Image,
  Circle,
};

/**
 * WIP
 *
 *  - cannot have more than 2 props with defaults. If one is not empty, then the default on the other will break
 *  - need a cleaner version for adding svgs with this function wrapper. Too much repetition
 *  - how can I create an enum for this
 *
 * */
