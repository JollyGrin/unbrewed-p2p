import { renderToStaticMarkup } from "react-dom/server";
import { ImageFace } from "@/components/CardFactory/Card";
import { CardSvg } from "@/components/CardFactory/card.factory";
import {
  calculateProps,
  getMeasureCanvas,
} from "@/components/CardFactory/card.helpers";
import { DeckImportCardType } from "@/components/DeckPool/deck-import.type";
import type { SheetCrop } from "@/components/Positions/position.type";
import { escapeAttr } from "./index";

/**
 * SVG-string face for a card token, injected into the d3 canvas alongside
 * the other TokenMarkup builders. Faces are string-rendered from the same
 * React components the hand/modals use (ImageFace / CardSvg) so image,
 * sprite-sheet, and generated decks all take the one code path.
 *
 * Generated faces re-run the text-measurement layout, and markup() runs on
 * every drag tick for every token — so results are cached. A token's card
 * never changes under the same id; only flip and resize vary.
 */
const cache = new Map<string, string>();
const CACHE_MAX = 300;

const safeId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, "");

export function cardTokenMarkup(t: {
  id: string;
  card: DeckImportCardType;
  faceDown?: boolean;
  w: number;
  h: number;
  /** Owner name + color — face-down backs wear a name plate so a table of
   * backs stays readable. */
  owner?: string;
  color?: string;
}): string {
  const key = `${t.id}|${t.faceDown ? 1 : 0}|${t.w}|${t.owner ?? ""}|${
    t.color ?? ""
  }`;
  const hit = cache.get(key);
  if (hit) return hit;

  let markup = t.faceDown ? backMarkup(t) : faceMarkup(t);
  if (t.faceDown && t.owner) {
    markup += ownerPlate({ w: t.w, h: t.h, name: t.owner, color: t.color });
  }
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(key, markup);
  return markup;
}

/**
 * Face for an image token whose url is a sprite sheet (hero/rule cards seeded
 * from a TTS import — see heroCardToken). Same ImageFace path as a card token,
 * but driven by the token's own `sheet` crop rather than a pool card, so the
 * token stays a plain image and never couples to the deck's pool.
 */
export function sheetImageMarkup(t: {
  id: string;
  url: string;
  sheet: SheetCrop;
  w: number;
  h: number;
}): string {
  const key = `sheet|${t.url}|${t.sheet.index}|${t.w}|${t.h}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const markup = renderToStaticMarkup(
    <ImageFace
      image={{ url: t.url, ...t.sheet }}
      title="hero card"
      width={t.w}
      height={t.h}
      clipId={`sheetclip-${safeId(t.id)}`}
    />,
  );
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(key, markup);
  return markup;
}

/**
 * Pill with the owner's name pinned to the bottom of a face-down card.
 * Token-pixel coords (appended after the face svg, like counterBadge) so it
 * stays the same size whatever the card is resized to.
 */
const ownerPlate = ({
  w,
  h,
  name,
  color,
}: {
  w: number;
  h: number;
  name: string;
  color?: string;
}): string => {
  const label = name.length > 14 ? `${name.slice(0, 13)}…` : name;
  const lw = Math.min(label.length * 6.6 + 20, w - 6);
  return `<g transform="translate(${w / 2}, ${h - 16})" pointer-events="none">
  <rect x="${-lw / 2}" y="-10" width="${lw}" height="20" rx="10" fill="#2C1831" stroke="${escapeAttr(
    color ?? "#E7CC98",
  )}" stroke-width="1.5" opacity="0.92" />
  <text text-anchor="middle" dominant-baseline="central" font-family="Verdana, sans-serif" font-size="10.5" font-weight="700" fill="#F7ECD7">${escapeAttr(
    label,
  )}</text>
</g>`;
};

const faceMarkup = (t: {
  id: string;
  card: DeckImportCardType;
  w: number;
  h: number;
}): string => {
  const image = t.card.cardImage;
  if (image?.url) {
    return renderToStaticMarkup(
      <ImageFace
        image={image}
        title={t.card.title}
        width={t.w}
        height={t.h}
        clipId={`cardclip-${safeId(t.id)}`}
      />,
    );
  }
  const canvas = getMeasureCanvas();
  if (!canvas) return placeholderMarkup(t);
  return renderToStaticMarkup(
    <CardSvg
      card={t.card}
      props={calculateProps(t.card, canvas)}
      width={t.w}
      height={t.h}
      idPrefix={`card-${safeId(t.id)}-`}
    />,
  );
};

/** House card back as an svg string — the palette of CardBack, minus HTML. */
const backMarkup = (t: {
  id: string;
  card: DeckImportCardType;
  w: number;
  h: number;
}): string => {
  if (t.card.cardBackUrl) {
    return renderToStaticMarkup(
      <ImageFace
        image={{ url: t.card.cardBackUrl }}
        title="card back"
        width={t.w}
        height={t.h}
        clipId={`cardclip-${safeId(t.id)}`}
      />,
    );
  }
  const gradId = `cardback-${safeId(t.id)}`;
  return `<svg width="${t.w}" height="${t.h}" viewBox="0 0 63 88" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="${gradId}" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="#48284F" />
      <stop offset="1" stop-color="#2C1831" />
    </linearGradient>
  </defs>
  <rect width="63" height="88" rx="2.5" fill="url(#${gradId})" stroke="#E7CC98" stroke-width="1.5" />
  <rect x="4" y="4" width="55" height="80" rx="1.5" fill="none" stroke="rgba(231, 204, 152, 0.35)" stroke-width="0.75" />
  <circle cx="31.5" cy="44" r="12" fill="none" stroke="rgba(231, 204, 152, 0.45)" stroke-width="0.75" />
  <circle cx="31.5" cy="44" r="7" fill="rgba(231, 204, 152, 0.18)" />
</svg>`;
};

/** Measure canvas unavailable (shouldn't happen client-side) — plain slab. */
const placeholderMarkup = (t: { w: number; h: number }): string =>
  `<svg width="${t.w}" height="${t.h}" viewBox="0 0 63 88" xmlns="http://www.w3.org/2000/svg">
  <rect width="63" height="88" rx="2.5" fill="#F7ECD7" stroke="#48284F" />
</svg>`;
