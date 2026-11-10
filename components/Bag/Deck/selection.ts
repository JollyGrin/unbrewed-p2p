/**
 * Text selection on the dark purple deck-detail surfaces. The browser default
 * (a translucent grey-blue) leaves the muted, low-opacity text on the purple
 * panel nearly unreadable once selected. A solid parchment with the deep
 * purple as ink is brand-consistent and well over 4.5:1.
 *
 * The background is the parchment `brand.highlight`, not the gold accent, on
 * purpose: much of the muted copy here is dimmed with the CSS `opacity`
 * property (0.55 - 0.8), which also dims the selection painted on it, so what
 * matters is the contrast AFTER that blend. Gold falls under 4.5:1 below ~0.7
 * opacity (3.3:1 at 0.55); parchment holds 4.6:1 even at 0.55.
 *
 * Scoped to the deck-detail screen and its inspector modal (the modal is
 * portaled out of the screen's DOM, so it carries the same rule); the app-wide
 * selection in styles/style.ts is deliberately untouched.
 *
 * `-webkit-text-fill-color` is set too: muted copy that is painted through a
 * text fill rather than `color` would otherwise ignore the `color` here.
 */
const selected = {
  background: "#F1E0C1", // brand.highlight
  color: "#2C1831", // brand.surfaceDim
  WebkitTextFillColor: "#2C1831",
  textShadow: "none",
} as const;

export const selectionSx = {
  "&::selection, & *::selection": selected,
} as const;
