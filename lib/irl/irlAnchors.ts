/**
 * Card-flight anchors (issue #811). The tray's real elements say what they
 * are with `data-irl-anchor` — `deck-tile`, `discard-tile`, `hand-tile`,
 * `hand-card`, `in-play-card`, `boost-slot-<i>`, `hand-grid-card-<index>`,
 * `discard-row-<index>` — and a flight asks here where one is on screen.
 *
 * Plain DOM, no React: a flight reads its source's rect synchronously, in
 * the fx subscriber, before the re-render that moves the card away.
 */

export type AnchorRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export const IRL_ANCHOR_ATTR = "data-irl-anchor";

/** Spread onto the element a card flight leaves from or lands on. */
export const irlAnchor = (name: string) => ({ [IRL_ANCHOR_ATTR]: name });

const snapshot = ({ left, top, width, height }: AnchorRect): AnchorRect => ({
  left,
  top,
  width,
  height,
});

/**
 * On screen means: it has a size, its middle is inside the viewport, and the
 * element hit at its middle is the anchor or inside it — so a tray tile under
 * a full-screen sheet, or a grid card scrolled out of its list, is not. The
 * flight layer is `pointer-events: none`, so its own ghosts never hide an
 * anchor. Without `elementFromPoint` (jsdom) only the geometry is checked.
 */
export const isAnchorOnScreen = (el: Element, doc: Document = document) => {
  const rect = el.getBoundingClientRect();
  if (!(rect.width > 0 && rect.height > 0)) return false;
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const view = doc.defaultView;
  const vw = view?.innerWidth ?? doc.documentElement.clientWidth;
  const vh = view?.innerHeight ?? doc.documentElement.clientHeight;
  if (x < 0 || y < 0 || x > vw || y > vh) return false;
  if (typeof doc.elementFromPoint !== "function") return true;
  const hit = doc.elementFromPoint(x, y);
  return !!hit && (hit === el || el.contains(hit));
};

/** A name ending in `*` matches every anchor that starts with the rest. */
const selectorFor = (name: string) =>
  name.endsWith("*")
    ? `[${IRL_ANCHOR_ATTR}^="${name.slice(0, -1)}"]`
    : `[${IRL_ANCHOR_ATTR}="${name}"]`;

/**
 * The first name in `chain` with an element on screen, and where it is. When
 * several elements carry the name (the tray card and the card view's), the
 * last one on screen wins — the newest, topmost sheet. Null when none is;
 * never throws.
 */
export const findAnchor = (
  chain: readonly string[],
  doc: Document = document,
): { name: string; rect: AnchorRect } | null => {
  try {
    for (const name of chain) {
      const matches = Array.from(doc.querySelectorAll(selectorFor(name)));
      for (let i = matches.length - 1; i >= 0; i--) {
        if (isAnchorOnScreen(matches[i], doc)) {
          return { name, rect: snapshot(matches[i].getBoundingClientRect()) };
        }
      }
    }
  } catch {
    // a detached document or a bad name: fall through to "not on screen"
  }
  return null;
};

/** A `size`-sized rect in the middle of the screen. */
export const screenCentre = (
  size: { width: number; height: number },
  doc: Document = document,
): AnchorRect => {
  const view = doc.defaultView;
  const vw = view?.innerWidth ?? doc.documentElement.clientWidth ?? 0;
  const vh = view?.innerHeight ?? doc.documentElement.clientHeight ?? 0;
  return {
    left: vw / 2 - size.width / 2,
    top: vh / 2 - size.height / 2,
    width: size.width,
    height: size.height,
  };
};

/**
 * {@link findAnchor}, falling back to the screen centre (at `size`) when no
 * anchor in the chain is on screen — `name` is null then. Always a rect.
 */
export const resolveAnchor = (
  chain: readonly string[],
  size: { width: number; height: number },
  doc: Document = document,
): { name: string | null; rect: AnchorRect } =>
  findAnchor(chain, doc) ?? { name: null, rect: screenCentre(size, doc) };
