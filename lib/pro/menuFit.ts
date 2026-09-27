/**
 * Keep the mobile game menu (⋮) inside the viewport (issue #917).
 *
 * Chakra's Menu positions its list with Popper, and Popper only ever MOVES a
 * popper — it never sizes one. On a short landscape phone the ~12-row game menu
 * is taller than the screen, so the bottom rows (Forfeit…, Report a bug, the
 * account chip) sat off-screen with nothing to scroll. The fix is a height cap
 * the list scrolls inside: `menuMaxHeight` is the room on the side the list
 * opens towards, and `fitMenuToViewport` is the Popper modifier that measures
 * the trigger each update and publishes that room as `--pro-menu-max-h` on the
 * positioner, which the MenuList reads as its `maxH`.
 */
import type { UsePopperProps } from "@chakra-ui/react";

/** CSS custom property the modifier writes and the MenuList reads. */
export const MENU_MAX_H_VAR = "--pro-menu-max-h";

/** Room kept between the list and the viewport / safe-area edge. */
export const MENU_EDGE_PAD = 8;

/** Chakra's default Menu gutter (the gap between trigger and list). */
export const MENU_GUTTER = 8;

/** Never collapse the list to less than a few rows, even when cramped. */
export const MENU_MIN_H = 120;

export type MenuSide = "top" | "bottom" | "left" | "right";

export type MenuFitInput = {
  /** the side of the trigger the list opens on (Popper's base placement) */
  side: MenuSide;
  /** the trigger's viewport rect (only the vertical edges matter) */
  triggerTop: number;
  triggerBottom: number;
  viewportHeight: number;
  /** env(safe-area-inset-top/bottom) — the notch / home indicator */
  safeTop: number;
  safeBottom: number;
};

/**
 * The tallest the list may be. Opening above or below the trigger, it gets the
 * space between the trigger and that edge; opening beside it (right-start on
 * the tabletop's side column), Popper's preventOverflow slides it vertically,
 * so it gets the whole safe viewport height.
 */
export const menuMaxHeight = ({
  side,
  triggerTop,
  triggerBottom,
  viewportHeight,
  safeTop,
  safeBottom,
}: MenuFitInput): number => {
  const top = safeTop + MENU_EDGE_PAD;
  const bottom = viewportHeight - safeBottom - MENU_EDGE_PAD;
  const room =
    side === "top"
      ? triggerTop - MENU_GUTTER - top
      : side === "bottom"
        ? bottom - triggerBottom - MENU_GUTTER
        : bottom - top;
  return Math.max(MENU_MIN_H, Math.floor(room));
};

/** Reads the notch / home-indicator insets (0 where the device has none). */
const readSafeArea = (): { top: number; bottom: number } => {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;visibility:hidden;pointer-events:none;" +
    "padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)";
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const insets = { top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0 };
  probe.remove();
  return insets;
};

type PopperModifier = NonNullable<UsePopperProps["modifiers"]>[number];

/**
 * Popper modifier: after placement is settled, cap the list to the room on its
 * side. Module-level (a stable reference) on purpose — Chakra's usePopper
 * rebuilds the Popper instance whenever the `modifiers` array identity changes.
 */
export const fitMenuToViewport: PopperModifier = {
  name: "fitMenuToViewport",
  enabled: true,
  phase: "main",
  requiresIfExists: ["offset", "flip", "preventOverflow"],
  fn: ({ state }) => {
    const trigger = (state.elements.reference as Element).getBoundingClientRect();
    const safe = readSafeArea();
    const px = menuMaxHeight({
      side: state.placement.split("-")[0] as MenuSide,
      triggerTop: trigger.top,
      triggerBottom: trigger.bottom,
      viewportHeight: window.visualViewport?.height ?? window.innerHeight,
      safeTop: safe.top,
      safeBottom: safe.bottom,
    });
    state.elements.popper.style.setProperty(MENU_MAX_H_VAR, `${px}px`);
  },
};

/** Stable modifiers array for `<Menu modifiers={…}>`. */
export const MENU_FIT_MODIFIERS: PopperModifier[] = [
  fitMenuToViewport,
  // Keep the side-opening list off the very edge (Popper's default padding is 0).
  { name: "preventOverflow", options: { boundary: "clippingParents", padding: MENU_EDGE_PAD } },
];
