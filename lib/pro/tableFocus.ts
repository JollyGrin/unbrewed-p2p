/**
 * What the tabletop view's auto-focus zoom frames when a prompt appears.
 *
 * The flat board (ProBoard) frames the picks alone, and on a flat board that
 * is fine: its fit already leaves the whole map on screen, and a pick-only
 * zoom is modest. The tabletop is different. In landscape its resting board is
 * short (the tilt costs height), so a pick-only focus zooms hard and slides the
 * rest of the board off to the side — measured with the visual probe, the
 * opponent's standee ended up under the 230px landscape rail on the very first
 * "choose a space" prompt of a game. The player then had to pick a space
 * without seeing who they were moving towards.
 *
 * A table game keeps the fighters in frame: the reference app never zooms
 * away from a piece mid-prompt. So the focus box here is the picks PLUS every
 * fighter on the board. When the pieces are close together the view still
 * zooms onto them; when they are spread out, the focus settles near the
 * resting fit, which is the honest answer — there is no zoom that shows both.
 *
 * Only the picks decide WHETHER there is a focus at all (no picks → null, so
 * the caller releases it); fighters only widen the frame.
 */
import type { ScreenBox } from "./touchTargets";

/** Zero-size rects come from elements not laid out yet (or display:none); a
 *  (0,0) corner from one of them would drag the frame to the page origin. */
const hasArea = (b: ScreenBox): boolean => b.right > b.left && b.bottom > b.top;

export const tableFocusBox = (
  pickBoxes: readonly ScreenBox[],
  keepVisible: readonly ScreenBox[]
): ScreenBox | null => {
  const picks = pickBoxes.filter(hasArea);
  if (picks.length === 0) return null;
  const all = [...picks, ...keepVisible.filter(hasArea)];
  return {
    left: Math.min(...all.map((b) => b.left)),
    top: Math.min(...all.map((b) => b.top)),
    right: Math.max(...all.map((b) => b.right)),
    bottom: Math.max(...all.map((b) => b.bottom)),
  };
};

/**
 * How big a pick is under a thumb (px) — what decides whether the focus zoom
 * fires at all (lib/pro/touchTargets `shouldAutoFocus`, 44px).
 *
 * The flat board's picks are circles, so the short side of their box was the
 * honest size. A tilted board foreshortens every space into an ellipse about
 * 0.7 as tall as it is wide: a 60 x 40 space is easy to hit, but judged by its
 * 40px height it triggered the zoom anyway — which, on a wide phone, enlarged
 * the board by 14% and slid a whole column of spaces off the left edge and
 * under the HUD's buttons (owner's screenshot, 2026-09-23). The diameter of a
 * circle of the same area judges the ellipse by what a fingertip meets.
 */
export const pickTapSizePx = ({ width, height }: { width: number; height: number }): number =>
  Math.sqrt(Math.max(width, 0) * Math.max(height, 0));
