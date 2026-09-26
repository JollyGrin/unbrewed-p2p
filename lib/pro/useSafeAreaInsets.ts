/**
 * The device's safe-area insets in px — the strips a notch, a Dynamic Island
 * or the home indicator make unusable.
 *
 * The page opts into the whole screen (`viewport-fit=cover`, see
 * components/Helmet/Head.tsx), so on an iPhone held sideways the page runs
 * under the camera cut-out: 59px on each side on an iPhone 15 Pro. The fixed
 * chrome pads itself with `env(safe-area-inset-*)` in CSS, but the board's
 * fit is arithmetic in JS, and JS cannot read `env()` directly — so a hidden
 * probe element is padded with it and its computed padding is read back. The
 * tabletop board once filled the width right into the notch because of this.
 */
import { useEffect, useState } from "react";

export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const ZERO_INSETS: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };

type PaddingStyle = Pick<CSSStyleDeclaration, "paddingTop" | "paddingRight" | "paddingBottom" | "paddingLeft">;

const px = (value: string): number => {
  const n = parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** The probe element's resolved padding, as insets. */
export const insetsFromPadding = (style: PaddingStyle): SafeAreaInsets => ({
  top: px(style.paddingTop),
  right: px(style.paddingRight),
  bottom: px(style.paddingBottom),
  left: px(style.paddingLeft),
});

const same = (a: SafeAreaInsets, b: SafeAreaInsets) =>
  a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;

export const useSafeAreaInsets = (enabled: boolean): SafeAreaInsets => {
  const [insets, setInsets] = useState<SafeAreaInsets>(ZERO_INSETS);

  useEffect(() => {
    if (!enabled || typeof document === "undefined") {
      setInsets(ZERO_INSETS);
      return;
    }
    const probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText =
      "position:fixed;visibility:hidden;pointer-events:none;top:0;left:0;" +
      "padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)";
    document.body.appendChild(probe);
    const read = () => {
      const next = insetsFromPadding(getComputedStyle(probe));
      setInsets((prev) => (same(prev, next) ? prev : next));
    };
    read();
    // The insets change sides when the phone turns; a resize follows every turn.
    window.addEventListener("resize", read);
    window.addEventListener("orientationchange", read);
    return () => {
      window.removeEventListener("resize", read);
      window.removeEventListener("orientationchange", read);
      probe.remove();
    };
  }, [enabled]);

  return insets;
};
