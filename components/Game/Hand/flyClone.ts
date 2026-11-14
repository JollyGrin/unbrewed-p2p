import { motionAllowed } from "./fanMotion";

/**
 * Send a copy of a hand card flying to a spot on screen (a pile button) while
 * the real one leaves the hand at once. Decorative only: the copy ignores the
 * pointer, nothing waits for it, and it removes itself. Runs on the
 * compositor (Web Animations), since nothing ever retargets it.
 */
export const flyClone = (
  el: HTMLElement | null | undefined,
  to: { left: number; top: number; width: number; height: number } | null,
  pose: { scale?: number; rot?: number } = {},
): void => {
  if (!el || !to || !motionAllowed()) return;
  if (typeof el.animate !== "function") return;
  const from = el.getBoundingClientRect();
  const width = el.offsetWidth;
  const height = el.offsetHeight;
  if (!width || !height) return;
  const cx = from.left + from.width / 2;
  const cy = from.top + from.height / 2;
  const dx = to.left + to.width / 2 - cx;
  const dy = to.top + to.height / 2 - cy;
  const scale = pose.scale ?? 1;
  const rot = pose.rot ?? 0;

  const flyer = document.createElement("div");
  flyer.setAttribute("aria-hidden", "true");
  flyer.dataset.cardFlyer = "";
  Object.assign(flyer.style, {
    position: "fixed",
    left: `${cx - width / 2}px`,
    top: `${cy - height / 2}px`,
    width: `${width}px`,
    height: `${height}px`,
    pointerEvents: "none",
    zIndex: "400",
    willChange: "transform, opacity",
  });
  const copy = el.cloneNode(true) as HTMLElement;
  copy.style.transform = "none";
  copy.style.opacity = "1";
  flyer.appendChild(copy);
  document.body.appendChild(flyer);

  const end = Math.max(0.12, Math.min(0.3, to.height / height));
  const anim = flyer.animate(
    [
      { transform: `translate(0px, 0px) rotate(${rot}deg) scale(${scale})`, opacity: 1 },
      { opacity: 1, offset: 0.6 },
      {
        transform: `translate(${dx}px, ${dy}px) rotate(0deg) scale(${end})`,
        opacity: 0,
      },
    ],
    { duration: FLY_MS, easing: "cubic-bezier(0.45, 0, 0.7, 0.6)", fill: "forwards" },
  );
  const done = () => flyer.remove();
  anim.onfinish = done;
  anim.oncancel = done;
};

/** A hand card on its way to a pile, ms. */
export const FLY_MS = 220;
