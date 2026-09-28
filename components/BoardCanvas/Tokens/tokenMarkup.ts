import {
  DEFAULT_TOKEN_SIZE,
  OwnedToken,
  TOKEN_LABEL_MAX,
  cardTokenHeight,
  shownSheet,
} from "@/components/Positions/position.type";
import { TokenMarkup } from "./index";
import { cardTokenMarkup, sheetImageMarkup } from "./cardFace";

export type IconSvg = (
  name: string,
  opts: { color?: string; size: number; cutout?: boolean; maskId?: string },
) => string | null;

/** Hero/rule cards seeded from a TTS sheet are 63:88; they keep the card
 * face renderer (rounded corners) they have always drawn with. */
const isCardAspect = (w: number, h: number) =>
  Math.abs(h / w - 88 / 63) < 0.02;

const safeId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, "");

/**
 * The inner svg of one board token. There is no kind field: the face is
 * chosen by which fields are present — `card` → `imageUrl` (whole image or a
 * `sheet` cell) → `icon` → a plain colour disc. The display fields (#1003)
 * only decorate that choice: `clip` rounds an image face, `flipped` picks the
 * `altIndex` cell of a sheet, `label` hangs a name under any token.
 *
 * `brokenImage` says the board saw this token's image fail to load: the face
 * becomes a placeholder, and the label, counter and rings still draw.
 */
export function tokenMarkup(
  d: OwnedToken,
  opts: {
    own: boolean;
    selected: boolean;
    iconSvg: IconSvg;
    brokenImage?: boolean;
  },
): string {
  const w = d.size ?? DEFAULT_TOKEN_SIZE;
  const h = d.card
    ? d.h ?? cardTokenHeight(w)
    : d.imageUrl
      ? d.h ?? w
      : w;
  const round = !d.card && Boolean(d.imageUrl) && d.clip === "circle";
  let inner: string;
  if (d.card) {
    inner = cardTokenMarkup({
      id: d.id,
      card: d.card,
      faceDown: d.faceDown,
      w,
      h,
      owner: d.owner,
      color: d.color,
    });
  } else if (d.imageUrl && opts.brokenImage) {
    inner = TokenMarkup.missingImage({ w, h, round });
  } else if (d.imageUrl) {
    const sheet = shownSheet(d);
    inner = !sheet
      ? TokenMarkup.image({
          url: d.imageUrl,
          w,
          h,
          fit: round ? "slice" : "meet",
        })
      : isCardAspect(w, h)
        ? sheetImageMarkup({ id: d.id, url: d.imageUrl, sheet, w, h })
        : TokenMarkup.sheetCell({ url: d.imageUrl, w, h, ...sheet });
    if (round) {
      inner = TokenMarkup.circleClip({
        id: `tokclip-${safeId(d.id)}`,
        w,
        h,
        inner,
      });
    }
  } else if (d.icon) {
    inner =
      opts.iconSvg(d.icon, {
        color: d.color,
        size: w,
        cutout: d.cutout,
        // Mask ids live in the shared document — keep them unique per
        // token and free of characters that break url(#…) references.
        maskId: `cut-${safeId(d.id)}`,
      }) ?? TokenMarkup.circle({ color: d.color, size: w });
  } else {
    inner = TokenMarkup.circle({ color: d.color, size: w });
  }
  if (opts.selected && opts.own) {
    inner += TokenMarkup.selectionRing({ w, h, round });
  }
  if (d.card && d.claimedBy) {
    inner += TokenMarkup.claimRing({ w, h });
  }
  if (d.counter) {
    const linked =
      d.counter.link === "extra" ? "character" : d.counter.link;
    inner += TokenMarkup.counterBadge({
      w,
      text: d.counterDisplay == null ? "–" : String(d.counterDisplay),
      title: opts.own
        ? `${linked ? `${linked} HP` : "counter"} — click +1, right-click −1`
        : linked
          ? `${d.owner}'s ${linked} HP`
          : `${d.owner}'s counter`,
    });
  }
  const label = typeof d.label === "string" ? d.label.trim() : "";
  if (label) {
    inner += TokenMarkup.labelPlate({
      w,
      h,
      text:
        label.length > TOKEN_LABEL_MAX
          ? `${label.slice(0, TOKEN_LABEL_MAX - 1)}…`
          : label,
    });
  }
  return inner;
}
