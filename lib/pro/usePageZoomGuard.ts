/**
 * Keeps the BROWSER's own page zoom off the game (player feedback).
 *
 * The board has its own pinch-to-zoom (`useZoomPan`), and its container opts out
 * of browser gestures with `touch-action: none`. A pinch that starts anywhere
 * else — the dock, the hand, the margin beside the board — is a PAGE zoom
 * instead: it scales the cards, the buttons and the board together, and iOS
 * offers no way back short of hitting exactly the right spot to pinch out again.
 * One player had to reload mid-game.
 *
 * Two mechanisms, because no single one covers both engines:
 * - `touch-action: pan-x pan-y` on the document root removes pinch zoom AND
 *   double-tap zoom while scrolling keeps working (Chrome, Android).
 * - Safari ignores that for page zoom and instead fires its own `gesture*`
 *   events, which have to be cancelled explicitly (iOS, macOS Safari).
 *
 * Scoped to the page that mounts it: everywhere else in the app the browser's
 * zoom is a genuine accessibility tool and stays untouched.
 */
import { useEffect } from "react";

/** The board's own pinch is unaffected: it runs on pointer events. */
export const GAME_TOUCH_ACTION = "pan-x pan-y";

/** Marks the injected rule, so a test (and a curious player) can find it. */
export const ZOOM_GUARD_STYLE_ID = "pro-page-zoom-guard";

export function usePageZoomGuard(enabled = true): void {
  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;

    // A stylesheet rule rather than an inline style: it applies to the root
    // element without fighting anything else that writes `style` on it.
    const style = document.createElement("style");
    style.id = ZOOM_GUARD_STYLE_ID;
    style.textContent = `html, body { touch-action: ${GAME_TOUCH_ACTION}; }`;
    document.head.appendChild(style);

    const block = (event: Event) => event.preventDefault();
    const options: AddEventListenerOptions = { passive: false };
    const gestures = ["gesturestart", "gesturechange", "gestureend"];
    for (const name of gestures) document.addEventListener(name, block, options);

    return () => {
      style.remove();
      for (const name of gestures) document.removeEventListener(name, block, options);
    };
  }, [enabled]);
}
