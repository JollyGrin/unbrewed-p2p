/**
 * Default Tokens for the board!
 *
 * To add to this list, add the file to /public/tokens/...
 *
 * Then add the filename to IMAGES
 * */

const IMAGES = [
  "Alien.svg",
  "BrickWall.svg",
  "CloudFog.svg",
  "Fire.svg",
  "Flag.svg",
  "HandShield.svg",
  "ShieldHalf.svg",
  "Totem.svg",
  "Trap.svg",
];

export const DEFAULT_TOKEN_IMAGES = IMAGES.map((img) => `/tokens/${img}`);
