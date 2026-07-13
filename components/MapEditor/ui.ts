/**
 * Shared button styling for the dev map editor's dark parchment-on-purple
 * panels (Chakra's default gray is unreadable on `brand.surfaceDim`). Kept as
 * plain prop bags rather than global theme variants so the dev tool stays
 * self-contained.
 */
export const BTN = {
  size: "xs" as const,
  bg: "whiteAlpha.200",
  color: "brand.parchment",
  _hover: { bg: "whiteAlpha.400" },
  _active: { bg: "whiteAlpha.500" },
  _disabled: { opacity: 0.35, cursor: "not-allowed" },
};

export const BTN_ON = {
  ...BTN,
  bg: "brand.accent",
  color: "brand.surfaceDim",
  _hover: { bg: "brand.accentDeep" },
  _active: { bg: "brand.accentDeep" },
};
